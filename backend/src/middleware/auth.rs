use axum::{
    extract::{Request, State},
    http::StatusCode,
    middleware::Next,
    response::Response,
};
use axum_extra::{
    headers::{authorization::Bearer, Authorization},
    TypedHeader,
};

use crate::{
    auth::{Claims, TokenService},
    AppError, Result,
};

pub async fn auth_middleware(
    State(token_service): State<TokenService>,
    TypedHeader(authorization): TypedHeader<Authorization<Bearer>>,
    mut request: Request,
    next: Next,
) -> Result<Response, AppError> {
    let token = authorization.token();
    let claims = token_service.verify_token(token)?;

    // Add claims to request extensions for handlers to access
    request.extensions_mut().insert(claims);

    Ok(next.run(request).await)
}

pub async fn optional_auth_middleware(
    State(token_service): State<TokenService>,
    authorization: Option<TypedHeader<Authorization<Bearer>>>,
    mut request: Request,
    next: Next,
) -> Response {
    if let Some(TypedHeader(authorization)) = authorization {
        let token = authorization.token();
        if let Ok(claims) = token_service.verify_token(token) {
            request.extensions_mut().insert(claims);
        }
    }

    next.run(request).await
}

// Extension trait to easily get claims from request
pub trait ClaimsExt {
    fn claims(&self) -> Result<&Claims>;
    fn user_id(&self) -> Result<uuid::Uuid>;
}

impl ClaimsExt for Request {
    fn claims(&self) -> Result<&Claims> {
        self.extensions()
            .get::<Claims>()
            .ok_or_else(|| AppError::Auth("Missing authentication".to_string()))
    }

    fn user_id(&self) -> Result<uuid::Uuid> {
        let claims = self.claims()?;
        uuid::Uuid::parse_str(&claims.sub)
            .map_err(|_| AppError::Auth("Invalid user ID in token".to_string()))
    }
}
