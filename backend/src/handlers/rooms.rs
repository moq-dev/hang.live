use axum::{
    extract::{Path, Query, Request, State},
    response::Json,
    routing::{get, post, delete},
    Router,
};
use sqlx::PgPool;
use uuid::Uuid;
use validator::Validate;

use crate::{
    config::Config,
    db::models::{Room, RoomMember},
    middleware::ClaimsExt,
    storage::StorageProvider,
    types::{
        CreateRoomRequest, CreateRoomTokenRequest, PaginationQuery,
        RoomDetailResponse, RoomMemberResponse, RoomResponse, RoomTokenResponse, UserResponse,
    },
    auth::TokenService,
    AppError, Result,
};

type AppState = (PgPool, StorageProvider, Config);

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/rooms", get(list_rooms).post(create_room))
        .route("/rooms/:id", get(get_room))
        .route("/rooms/:id/join", post(join_room))
        .route("/rooms/:id/leave", delete(leave_room))
        .route("/rooms/:id/token", post(create_room_token))
        .route("/rooms/my", get(get_my_rooms))
}

async fn list_rooms(
    State((pool, _, _)): State<AppState>,
    Query(pagination): Query<PaginationQuery>,
) -> Result<Json<Vec<RoomResponse>>> {
    let rooms = Room::find_public(&pool, pagination.limit(), pagination.offset()).await?;

    let response: Vec<RoomResponse> = rooms
        .into_iter()
        .map(|room| RoomResponse {
            id: room.id,
            name: room.name,
            description: room.description,
            owner_id: room.owner_id,
            is_public: room.is_public,
            created_at: room.created_at.to_rfc3339(),
            member_count: None, // TODO: Add member count query if needed
        })
        .collect();

    Ok(Json(response))
}

async fn create_room(
    State((pool, _, _)): State<AppState>,
    request: Request,
    Json(create_request): Json<CreateRoomRequest>,
) -> Result<Json<RoomResponse>> {
    let user_id = request.user_id()?;

    // Validate request
    create_request.validate()
        .map_err(|e| AppError::Validation(format!("Validation error: {}", e)))?;

    let room = Room::create(
        &pool,
        &create_request.name,
        create_request.description.as_deref(),
        user_id,
        create_request.is_public,
    )
    .await?;

    let response = RoomResponse {
        id: room.id,
        name: room.name,
        description: room.description,
        owner_id: room.owner_id,
        is_public: room.is_public,
        created_at: room.created_at.to_rfc3339(),
        member_count: Some(1), // Owner is automatically a member
    };

    Ok(Json(response))
}

async fn get_room(
    State((pool, _, _)): State<AppState>,
    Path(room_id): Path<Uuid>,
    request: Request,
) -> Result<Json<RoomDetailResponse>> {
    let user_id = request.user_id()?;

    let room = Room::find_by_id(&pool, room_id)
        .await?
        .ok_or_else(|| AppError::NotFound("Room not found".to_string()))?;

    // Get room members
    let members_data = RoomMember::find_by_room(&pool, room_id).await?;
    let members: Vec<RoomMemberResponse> = members_data
        .iter()
        .map(|(member, user)| RoomMemberResponse {
            user: UserResponse {
                id: user.id,
                email: user.email.clone(),
                name: user.name.clone(),
                avatar_url: user.avatar_url.clone(),
                created_at: user.created_at.to_rfc3339(),
            },
            role: member.role.clone(),
            joined_at: member.joined_at.to_rfc3339(),
        })
        .collect();

    // Check if current user is a member and get their role
    let user_membership = RoomMember::find_by_room_and_user(&pool, room_id, user_id).await?;
    let is_member = user_membership.is_some();
    let user_role = user_membership.map(|m| m.role);

    // Check access - either public room or user is a member
    if !room.is_public && !is_member {
        return Err(AppError::Forbidden("Access denied to private room".to_string()));
    }

    let response = RoomDetailResponse {
        room: RoomResponse {
            id: room.id,
            name: room.name,
            description: room.description,
            owner_id: room.owner_id,
            is_public: room.is_public,
            created_at: room.created_at.to_rfc3339(),
            member_count: Some(members.len()),
        },
        members,
        is_member,
        user_role,
    };

    Ok(Json(response))
}

async fn join_room(
    State((pool, _, _)): State<AppState>,
    Path(room_id): Path<Uuid>,
    request: Request,
) -> Result<Json<RoomDetailResponse>> {
    let user_id = request.user_id()?;

    let room = Room::find_by_id(&pool, room_id)
        .await?
        .ok_or_else(|| AppError::NotFound("Room not found".to_string()))?;

    // Check if room is public or user has access
    if !room.is_public {
        return Err(AppError::Forbidden("Cannot join private room".to_string()));
    }

    // Check if user is already a member
    if RoomMember::find_by_room_and_user(&pool, room_id, user_id).await?.is_some() {
        return Err(AppError::Validation("Already a member of this room".to_string()));
    }

    // Add user as member
    RoomMember::create(&pool, room_id, user_id, "member").await?;

    // Return updated room details
    get_room(State((pool, StorageProvider::Local { base_path: "./uploads".to_string() }, Config::from_env().unwrap())), Path(room_id), request).await
}

async fn leave_room(
    State((pool, _, _)): State<AppState>,
    Path(room_id): Path<Uuid>,
    request: Request,
) -> Result<Json<serde_json::Value>> {
    let user_id = request.user_id()?;

    let room = Room::find_by_id(&pool, room_id)
        .await?
        .ok_or_else(|| AppError::NotFound("Room not found".to_string()))?;

    // Prevent owner from leaving their own room
    if room.owner_id == user_id {
        return Err(AppError::Validation("Room owner cannot leave the room".to_string()));
    }

    // Remove user from room
    RoomMember::remove(&pool, room_id, user_id).await?;

    Ok(Json(serde_json::json!({ "message": "Left room successfully" })))
}

async fn create_room_token(
    State((pool, _, config)): State<AppState>,
    Path(room_id): Path<Uuid>,
    request: Request,
    Json(token_request): Json<CreateRoomTokenRequest>,
) -> Result<Json<RoomTokenResponse>> {
    let user_id = request.user_id()?;
    let claims = request.claims()?;

    // Verify room exists and user has access
    let room = Room::find_by_id(&pool, room_id)
        .await?
        .ok_or_else(|| AppError::NotFound("Room not found".to_string()))?;

    // Check if user is a member
    let user_membership = RoomMember::find_by_room_and_user(&pool, room_id, user_id).await?;
    if user_membership.is_none() && !room.is_public {
        return Err(AppError::Forbidden("Access denied to room".to_string()));
    }

    let expires_in_minutes = token_request.expires_in_minutes.unwrap_or(60);
    if expires_in_minutes > 24 * 60 {
        return Err(AppError::Validation("Token cannot expire more than 24 hours from now".to_string()));
    }

    let token_service = TokenService::new(&config.jwt_secret);
    let room_token = token_service.create_room_token(
        user_id,
        &claims.email,
        &claims.name,
        room_id,
        expires_in_minutes,
    )?;

    let response = RoomTokenResponse {
        token: room_token,
        expires_in: expires_in_minutes,
    };

    Ok(Json(response))
}

async fn get_my_rooms(
    State((pool, _, _)): State<AppState>,
    request: Request,
) -> Result<Json<Vec<RoomResponse>>> {
    let user_id = request.user_id()?;

    let rooms = Room::find_by_user(&pool, user_id).await?;

    let response: Vec<RoomResponse> = rooms
        .into_iter()
        .map(|room| RoomResponse {
            id: room.id,
            name: room.name,
            description: room.description,
            owner_id: room.owner_id,
            is_public: room.is_public,
            created_at: room.created_at.to_rfc3339(),
            member_count: None,
        })
        .collect();

    Ok(Json(response))
}
