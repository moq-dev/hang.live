use crate::{
	auth::{self, OAuthService},
	config::Config,
	storage::StorageProvider,
};

// Application state type (must match the one in handlers)
#[derive(Clone)]
pub struct AppState {
	pub auth: auth::UserService,
	pub db: sqlx::PgPool,

	pub storage: StorageProvider,
	pub config: Config,
	pub oauth: OAuthService,
}
