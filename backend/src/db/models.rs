use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, PgPool};
use uuid::Uuid;

use crate::{AppError, Result};

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct User {
    pub id: Uuid,
    pub email: String,
    pub name: String,
    pub avatar_url: Option<String>,
    pub google_id: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Room {
    pub id: Uuid,
    pub name: String,
    pub description: Option<String>,
    pub owner_id: Uuid,
    pub is_public: bool,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct RoomMember {
    pub room_id: Uuid,
    pub user_id: Uuid,
    pub role: String,
    pub joined_at: DateTime<Utc>,
}

impl User {
    pub async fn create(
        pool: &PgPool,
        email: &str,
        name: &str,
        google_id: Option<&str>,
    ) -> Result<Self> {
        let user = sqlx::query_as!(
            User,
            r#"
            INSERT INTO users (id, email, name, google_id)
            VALUES ($1, $2, $3, $4)
            RETURNING *
            "#,
            Uuid::new_v4(),
            email,
            name,
            google_id
        )
        .fetch_one(pool)
        .await?;

        Ok(user)
    }

    pub async fn find_by_id(pool: &PgPool, id: Uuid) -> Result<Option<Self>> {
        let user = sqlx::query_as!(User, "SELECT * FROM users WHERE id = $1", id)
            .fetch_optional(pool)
            .await?;

        Ok(user)
    }

    pub async fn find_by_email(pool: &PgPool, email: &str) -> Result<Option<Self>> {
        let user = sqlx::query_as!(User, "SELECT * FROM users WHERE email = $1", email)
            .fetch_optional(pool)
            .await?;

        Ok(user)
    }

    pub async fn find_by_google_id(pool: &PgPool, google_id: &str) -> Result<Option<Self>> {
        let user = sqlx::query_as!(
            User,
            "SELECT * FROM users WHERE google_id = $1",
            google_id
        )
        .fetch_optional(pool)
        .await?;

        Ok(user)
    }

    pub async fn update_avatar_url(pool: &PgPool, id: Uuid, avatar_url: &str) -> Result<()> {
        sqlx::query!(
            "UPDATE users SET avatar_url = $1, updated_at = NOW() WHERE id = $2",
            avatar_url,
            id
        )
        .execute(pool)
        .await?;

        Ok(())
    }
}

impl Room {
    pub async fn create(
        pool: &PgPool,
        name: &str,
        description: Option<&str>,
        owner_id: Uuid,
        is_public: bool,
    ) -> Result<Self> {
        let room = sqlx::query_as!(
            Room,
            r#"
            INSERT INTO rooms (id, name, description, owner_id, is_public)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING *
            "#,
            Uuid::new_v4(),
            name,
            description,
            owner_id,
            is_public
        )
        .fetch_one(pool)
        .await?;

        // Add owner as a member
        RoomMember::create(pool, room.id, owner_id, "owner").await?;

        Ok(room)
    }

    pub async fn find_by_id(pool: &PgPool, id: Uuid) -> Result<Option<Self>> {
        let room = sqlx::query_as!(Room, "SELECT * FROM rooms WHERE id = $1", id)
            .fetch_optional(pool)
            .await?;

        Ok(room)
    }

    pub async fn find_by_user(pool: &PgPool, user_id: Uuid) -> Result<Vec<Self>> {
        let rooms = sqlx::query_as!(
            Room,
            r#"
            SELECT r.* FROM rooms r
            JOIN room_members rm ON r.id = rm.room_id
            WHERE rm.user_id = $1
            ORDER BY r.created_at DESC
            "#,
            user_id
        )
        .fetch_all(pool)
        .await?;

        Ok(rooms)
    }

    pub async fn find_public(pool: &PgPool, limit: i64, offset: i64) -> Result<Vec<Self>> {
        let rooms = sqlx::query_as!(
            Room,
            "SELECT * FROM rooms WHERE is_public = true ORDER BY created_at DESC LIMIT $1 OFFSET $2",
            limit,
            offset
        )
        .fetch_all(pool)
        .await?;

        Ok(rooms)
    }
}

impl RoomMember {
    pub async fn create(pool: &PgPool, room_id: Uuid, user_id: Uuid, role: &str) -> Result<Self> {
        let member = sqlx::query_as!(
            RoomMember,
            r#"
            INSERT INTO room_members (room_id, user_id, role)
            VALUES ($1, $2, $3)
            RETURNING *
            "#,
            room_id,
            user_id,
            role
        )
        .fetch_one(pool)
        .await?;

        Ok(member)
    }

    pub async fn find_by_room_and_user(
        pool: &PgPool,
        room_id: Uuid,
        user_id: Uuid,
    ) -> Result<Option<Self>> {
        let member = sqlx::query_as!(
            RoomMember,
            "SELECT * FROM room_members WHERE room_id = $1 AND user_id = $2",
            room_id,
            user_id
        )
        .fetch_optional(pool)
        .await?;

        Ok(member)
    }

    pub async fn find_by_room(pool: &PgPool, room_id: Uuid) -> Result<Vec<(Self, User)>> {
        let members = sqlx::query!(
            r#"
            SELECT
                rm.room_id, rm.user_id, rm.role, rm.joined_at,
                u.id as user_id, u.email, u.name, u.avatar_url, u.google_id, u.created_at as user_created_at, u.updated_at as user_updated_at
            FROM room_members rm
            JOIN users u ON rm.user_id = u.id
            WHERE rm.room_id = $1
            ORDER BY rm.joined_at ASC
            "#,
            room_id
        )
        .fetch_all(pool)
        .await?;

        let result = members
            .into_iter()
            .map(|row| {
                (
                    RoomMember {
                        room_id: row.room_id,
                        user_id: row.user_id,
                        role: row.role,
                        joined_at: row.joined_at,
                    },
                    User {
                        id: row.user_id,
                        email: row.email,
                        name: row.name,
                        avatar_url: row.avatar_url,
                        google_id: row.google_id,
                        created_at: row.user_created_at,
                        updated_at: row.user_updated_at,
                    },
                )
            })
            .collect();

        Ok(result)
    }

    pub async fn remove(pool: &PgPool, room_id: Uuid, user_id: Uuid) -> Result<()> {
        let result = sqlx::query!(
            "DELETE FROM room_members WHERE room_id = $1 AND user_id = $2",
            room_id,
            user_id
        )
        .execute(pool)
        .await?;

        if result.rows_affected() == 0 {
            return Err(AppError::NotFound("Room membership not found".to_string()));
        }

        Ok(())
    }
}
