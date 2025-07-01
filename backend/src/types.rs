use serde::{Deserialize, Serialize};
use uuid::Uuid;
use validator::Validate;

// Request types
#[derive(Debug, Serialize, Deserialize, Validate)]
pub struct CreateRoomRequest {
	#[validate(length(min = 4, max = 100, message = "Name must be between 4 and 100 characters"))]
	pub name: String,
	#[validate(length(max = 500, message = "Description must be less than 500 characters"))]
	pub description: Option<String>,
	pub is_public: bool,
}

#[derive(Debug, Serialize, Deserialize, Validate)]
pub struct UpdateUserRequest {
	#[validate(length(min = 4, max = 100, message = "Name must be between 4 and 100 characters"))]
	pub name: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Validate)]
pub struct JoinRoomRequest {
	pub room_id: Uuid,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CreateRoomTokenRequest {
	pub room_id: Uuid,
	pub expires_in_minutes: Option<i64>, // Default to 60 minutes
}

// Response types
#[derive(Debug, Serialize, Deserialize)]
pub struct AuthResponse {
	pub user: UserResponse,
	pub token: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct UserResponse {
	pub id: Uuid,
	pub email: String,
	pub name: String,
	pub avatar_url: Option<String>,
	pub created_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct RoomResponse {
	pub id: Uuid,
	pub name: String,
	pub description: Option<String>,
	pub owner_id: Uuid,
	pub is_public: bool,
	pub created_at: String,
	pub member_count: Option<usize>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct RoomMemberResponse {
	pub user: UserResponse,
	pub role: String,
	pub joined_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct RoomDetailResponse {
	pub room: RoomResponse,
	pub members: Vec<RoomMemberResponse>,
	pub is_member: bool,
	pub user_role: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct RoomTokenResponse {
	pub token: String,
	pub expires_in: i64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct UploadUrlResponse {
	pub upload_url: String,
	pub file_url: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct HealthResponse {
	pub status: String,
	pub timestamp: String,
	pub version: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ErrorResponse {
	pub error: String,
}

// Google OAuth callback query params
#[derive(Debug, Deserialize)]
pub struct GoogleCallbackQuery {
	pub code: String,
	pub state: String,
}

// Pagination
#[derive(Debug, Deserialize)]
pub struct PaginationQuery {
	pub page: Option<u32>,
	pub limit: Option<u32>,
}

impl Default for PaginationQuery {
	fn default() -> Self {
		Self {
			page: Some(1),
			limit: Some(20),
		}
	}
}

impl PaginationQuery {
	pub fn offset(&self) -> i64 {
		let page = self.page.unwrap_or(1);
		let limit = self.limit.unwrap_or(20);
		((page.saturating_sub(1)) * limit) as i64
	}

	pub fn limit(&self) -> i64 {
		let limit = self.limit.unwrap_or(20);
		limit.min(100) as i64 // Cap at 100
	}
}
