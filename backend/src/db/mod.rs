pub mod models;

use sqlx::{migrate::MigrateDatabase, PgPool, Postgres};

use crate::Result;

pub async fn migrate(pool: &PgPool) -> Result<()> {
    sqlx::migrate!("./migrations").run(pool).await?;
    Ok(())
}

pub async fn create_database_if_not_exists(url: &str) -> Result<()> {
    if !Postgres::database_exists(url).await? {
        Postgres::create_database(url).await?;
    }
    Ok(())
}
