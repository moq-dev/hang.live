use anyhow::Result;
use axum::{
	extract::DefaultBodyLimit,
	http::{HeaderValue, Method},
	Router,
};
use sqlx::PgPool;
use tower::ServiceBuilder;
use tower_http::{
	cors::CorsLayer,
	request_id::{MakeRequestUuid, PropagateRequestIdLayer, SetRequestIdLayer},
	services::ServeDir,
	trace::{DefaultMakeSpan, TraceLayer},
};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt, EnvFilter};

use hang_api::{
	auth::{OAuthService, UserService},
	config::{Config, StorageConfig},
	handlers::{auth, avatars, health, rooms, user},
	storage::StorageProvider,
};

#[dotenvy::load]
#[tokio::main]
async fn main() -> Result<()> {
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
	let oauth_service = OAuthService::new(&config)?;

	// User service for JWT authentication
	let user_service = UserService::new(&config.jwt_secret);

	// CORS configuration
	let cors = CorsLayer::new()
		.allow_origin([
			"http://localhost:1420".parse::<HeaderValue>()?,
			"https://tauri.localhost".parse::<HeaderValue>()?,
		])
		.allow_methods([Method::GET, Method::POST, Method::PUT, Method::DELETE, Method::PATCH])
		.allow_headers(tower_http::cors::Any)
		.allow_credentials(true);

	// App state for handlers
	let app_state = (
		pool.clone(),
		storage.clone(),
		config.clone(),
		oauth_service,
		user_service,
	);

	// All routes (authentication is now handled per-route using JWT extractors)
	let app_routes = Router::new()
		.merge(health::router())
		.merge(auth::router())
		.merge(user::router())
		.merge(rooms::router())
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
