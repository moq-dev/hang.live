use std::env;

use anyhow::Result;
use axum::{
    extract::DefaultBodyLimit,
    http::{HeaderValue, Method},
    middleware,
    Router,
};
use sqlx::PgPool;
use tower::ServiceBuilder;
use tower_http::{
    cors::CorsLayer,
    trace::{DefaultMakeSpan, TraceLayer},
    request_id::{MakeRequestUuid, PropagateRequestIdLayer, SetRequestIdLayer},
    services::ServeDir,
};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

use hang_api::{
    auth::TokenService,
    config::Config,
    db::migrate,
    handlers::{auth, health, rooms, users, avatars},
    middleware::auth_middleware,
    storage::StorageProvider,
};

#[tokio::main]
async fn main() -> Result<()> {
    dotenvy::dotenv().ok();

    // Initialize tracing
    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "hang_api=debug,tower_http=debug,axum::rejection=trace".into()),
        )
        .with(tracing_subscriber::fmt::layer())
        .init();

    let config = Config::from_env()?;

    // Database connection
    let pool = PgPool::connect(&config.database_url).await?;
    migrate(&pool).await?;

    // Storage provider
    let storage = StorageProvider::new(&config).await?;

    // Token service for middleware
    let token_service = TokenService::new(&config.jwt_secret);

    // CORS configuration
    let cors = CorsLayer::new()
        .allow_origin([
            "http://localhost:3000".parse::<HeaderValue>()?,
            "http://localhost:5173".parse::<HeaderValue>()?,
            "https://tauri.localhost".parse::<HeaderValue>()?,
        ])
        .allow_methods([Method::GET, Method::POST, Method::PUT, Method::DELETE, Method::PATCH])
        .allow_headers(tower_http::cors::Any)
        .allow_credentials(true);

    // App state
    let app_state = (pool.clone(), storage.clone(), config.clone());

    // Protected routes that require authentication
    let protected_routes = Router::new()
        .merge(users::router())
        .merge(rooms::router())
        .merge(avatars::router())
        .layer(middleware::from_fn_with_state(token_service, auth_middleware))
        .with_state(app_state.clone());

    // Public routes
    let public_routes = Router::new()
        .merge(health::router())
        .merge(auth::router())
        .with_state(app_state);

    // File serving for local uploads
    let file_service = if let crate::config::StorageConfig::Local { base_path } = &config.storage {
        Router::new().nest_service("/uploads", ServeDir::new(base_path))
    } else {
        Router::new()
    };

    let app = Router::new()
        .merge(public_routes)
        .merge(protected_routes)
        .merge(file_service)
        .layer(
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
                .layer(DefaultBodyLimit::max(10 * 1024 * 1024)) // 10MB upload limit
        );

    let port = env::var("PORT").unwrap_or_else(|_| "3001".to_string());
    let listener = tokio::net::TcpListener::bind(&format!("0.0.0.0:{}", port)).await?;

    tracing::info!("Server starting on http://localhost:{}", port);

    axum::serve(listener, app).await?;

    Ok(())
}
