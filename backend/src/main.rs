pub mod account;
pub mod auth;
pub mod avatars;
pub mod config;
pub mod db;
pub mod health;
pub mod storage;

mod error;
mod state;

pub use error::*;
pub use state::*;

use axum::{
	extract::DefaultBodyLimit,
	http::{HeaderName, HeaderValue, Method},
	Router,
};
use std::time::Duration;

use sqlx::PgPool;
use tower::ServiceBuilder;
use tower_http::{
	cors::{AllowHeaders, CorsLayer},
	request_id::{MakeRequestUuid, PropagateRequestIdLayer, SetRequestIdLayer},
	services::ServeDir,
	trace::{DefaultMakeSpan, TraceLayer},
};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt, EnvFilter};

use auth::{OAuthService, UserService};
use config::{Config, StorageConfig};
use storage::StorageProvider;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
	dotenvy::dotenv()?;

	// Initialize tracing
	tracing_subscriber::registry()
		.with(EnvFilter::from_default_env())
		.with(tracing_subscriber::fmt::layer())
		.init();

	// Load the TOML configuration file from ARGV[1]
	let path = std::env::args().nth(1).expect("Usage: hang-api <config.toml>");
	let config = Config::from_file(path)?;

	// Database connection
	let pool = PgPool::connect(&config.database_url).await?;

	// Storage provider
	let storage = StorageProvider::new(&config).await?;

	// OAuth service
	let oauth_service = OAuthService::new(&config).await?;

	// User service for JWT authentication
	let user_service = UserService::new(&config.jwt_secret);

	// CORS configuration
	let frontend_url = config.frontend_url.to_string();
	let cors = CorsLayer::new()
		.allow_origin([
			// We have to remove the trailing slash unfortunately.
			frontend_url.trim_end_matches('/').parse::<HeaderValue>()?,
			"https://tauri.localhost".parse::<HeaderValue>()?,
		])
		.allow_methods([Method::GET, Method::POST, Method::PUT, Method::DELETE, Method::PATCH])
		.allow_headers(AllowHeaders::list([
			HeaderName::from_static("authorization"),
			HeaderName::from_static("content-type"),
			HeaderName::from_static("x-requested-with"),
			HeaderName::from_static("accept"),
			HeaderName::from_static("origin"),
			HeaderName::from_static("user-agent"),
		]))
		.allow_credentials(true)
		.max_age(Duration::from_secs(3600)); // Cache preflight for 1 hour

	// App state for handlers
	let app_state = AppState {
		auth: user_service,
		db: pool.clone(),
		storage: storage.clone(),
		config: config.clone(),
		oauth: oauth_service,
	};

	// All routes (authentication is now handled per-route using JWT extractors)
	let app_routes = Router::new()
		.merge(health::router())
		.merge(auth::router())
		.merge(account::router())
		.merge(avatars::router())
		.with_state(app_state);

	// File serving for local uploads
	let file_service = if let StorageConfig::Local { base_path } = &config.storage {
		Router::new().nest_service("/uploads", ServeDir::new(base_path))
	} else {
		Router::new()
	};

	let app = Router::new().merge(app_routes).merge(file_service).layer(
		ServiceBuilder::new()
			.layer(SetRequestIdLayer::x_request_id(MakeRequestUuid))
			.layer(PropagateRequestIdLayer::x_request_id())
			.layer(
				TraceLayer::new_for_http()
					.make_span_with(DefaultMakeSpan::new().include_headers(true))
					.on_request(tower_http::trace::DefaultOnRequest::new().level(tracing::Level::INFO))
					.on_response(tower_http::trace::DefaultOnResponse::new().level(tracing::Level::INFO)),
			)
			.layer(cors)
			.layer(DefaultBodyLimit::max(10 * 1024 * 1024)), // 10MB upload limit
	);

	let port = config.port;
	let listener = tokio::net::TcpListener::bind(&format!("0.0.0.0:{}", port)).await?;

	tracing::info!("Server starting on http://localhost:{}", port);

	axum::serve(listener, app).await?;

	Ok(())
}
