-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    avatar TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- OAuth providers lookup table
CREATE TABLE oauth_providers (
    provider_name VARCHAR(50) PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- User OAuth provider accounts table
CREATE TABLE user_oauth_providers (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider_name VARCHAR(50) NOT NULL REFERENCES oauth_providers(provider_name),
    provider_user_id VARCHAR(255) NOT NULL,
    linked_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

    -- Composite primary key
    PRIMARY KEY (user_id, provider_name),
    -- Ensure one provider account can only be linked to one user
    UNIQUE(provider_name, provider_user_id)
);

-- Insert known OAuth providers
INSERT INTO oauth_providers (provider_name) VALUES
    ('google'),
    ('github'),
    ('discord'),
    ('microsoft'),
    ('facebook');

-- Indexes for performance
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_user_oauth_providers_user_id ON user_oauth_providers(user_id);
CREATE INDEX idx_user_oauth_providers_provider ON user_oauth_providers(provider_name, provider_user_id);

-- Updated at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers for updated_at
CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_oauth_providers_updated_at
    BEFORE UPDATE ON user_oauth_providers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
