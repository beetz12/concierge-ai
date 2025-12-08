-- Initial schema for Concierge AI application

-- Create custom types
CREATE TYPE request_status AS ENUM (
  'PENDING',
  'SEARCHING',
  'CALLING',
  'ANALYZING',
  'COMPLETED',
  'FAILED'
);

CREATE TYPE request_type AS ENUM (
  'RESEARCH_AND_BOOK',
  'DIRECT_TASK'
);

CREATE TYPE provider_source AS ENUM (
  'Google Maps',
  'User Input'
);

CREATE TYPE log_status AS ENUM (
  'success',
  'warning',
  'error',
  'info'
);

-- Create users table (extends Supabase auth.users)
CREATE TABLE users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Create service_requests table
CREATE TABLE service_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  type request_type NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  criteria TEXT NOT NULL,
  location TEXT,
  status request_status DEFAULT 'PENDING' NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  selected_provider_id UUID,
  final_outcome TEXT,
  direct_contact_info JSONB
);

-- Create providers table
CREATE TABLE providers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID REFERENCES service_requests(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  phone TEXT,
  rating DECIMAL(2,1),
  address TEXT,
  source provider_source,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Create interaction_logs table
CREATE TABLE interaction_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID REFERENCES service_requests(id) ON DELETE CASCADE NOT NULL,
  timestamp TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  step_name TEXT NOT NULL,
  detail TEXT NOT NULL,
  transcript JSONB,
  status log_status NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Add foreign key for selected_provider_id after providers table is created
ALTER TABLE service_requests
ADD CONSTRAINT service_requests_selected_provider_id_fkey
FOREIGN KEY (selected_provider_id) REFERENCES providers(id) ON DELETE SET NULL;

-- Create indexes for better query performance
CREATE INDEX idx_service_requests_user_id ON service_requests(user_id);
CREATE INDEX idx_service_requests_status ON service_requests(status);
CREATE INDEX idx_service_requests_created_at ON service_requests(created_at DESC);
CREATE INDEX idx_providers_request_id ON providers(request_id);
CREATE INDEX idx_interaction_logs_request_id ON interaction_logs(request_id);
CREATE INDEX idx_interaction_logs_timestamp ON interaction_logs(timestamp);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for updated_at
CREATE TRIGGER update_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_service_requests_updated_at
  BEFORE UPDATE ON service_requests
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Row Level Security (RLS) Policies
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE interaction_logs ENABLE ROW LEVEL SECURITY;

-- Users policies
CREATE POLICY "Users can view their own profile"
  ON users FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile"
  ON users FOR UPDATE
  USING (auth.uid() = id);

-- Service requests policies
CREATE POLICY "Users can view their own service requests"
  ON service_requests FOR SELECT
  USING (auth.uid() = user_id OR user_id IS NULL);

CREATE POLICY "Users can insert their own service requests"
  ON service_requests FOR INSERT
  WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

CREATE POLICY "Users can update their own service requests"
  ON service_requests FOR UPDATE
  USING (auth.uid() = user_id OR user_id IS NULL);

CREATE POLICY "Users can delete their own service requests"
  ON service_requests FOR DELETE
  USING (auth.uid() = user_id OR user_id IS NULL);

-- Providers policies (access through service_requests)
CREATE POLICY "Users can view providers for their service requests"
  ON providers FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM service_requests
      WHERE service_requests.id = providers.request_id
      AND (service_requests.user_id = auth.uid() OR service_requests.user_id IS NULL)
    )
  );

CREATE POLICY "Users can insert providers for their service requests"
  ON providers FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM service_requests
      WHERE service_requests.id = providers.request_id
      AND (service_requests.user_id = auth.uid() OR service_requests.user_id IS NULL)
    )
  );

CREATE POLICY "Users can update providers for their service requests"
  ON providers FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM service_requests
      WHERE service_requests.id = providers.request_id
      AND (service_requests.user_id = auth.uid() OR service_requests.user_id IS NULL)
    )
  );

CREATE POLICY "Users can delete providers for their service requests"
  ON providers FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM service_requests
      WHERE service_requests.id = providers.request_id
      AND (service_requests.user_id = auth.uid() OR service_requests.user_id IS NULL)
    )
  );

-- Interaction logs policies (access through service_requests)
CREATE POLICY "Users can view interaction logs for their service requests"
  ON interaction_logs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM service_requests
      WHERE service_requests.id = interaction_logs.request_id
      AND (service_requests.user_id = auth.uid() OR service_requests.user_id IS NULL)
    )
  );

CREATE POLICY "Users can insert interaction logs for their service requests"
  ON interaction_logs FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM service_requests
      WHERE service_requests.id = interaction_logs.request_id
      AND (service_requests.user_id = auth.uid() OR service_requests.user_id IS NULL)
    )
  );

-- Function to handle new user creation
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, email)
  VALUES (NEW.id, NEW.email);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to automatically create a user profile on signup
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user();

-- Enable Realtime for all tables
ALTER PUBLICATION supabase_realtime ADD TABLE users;
ALTER PUBLICATION supabase_realtime ADD TABLE service_requests;
ALTER PUBLICATION supabase_realtime ADD TABLE providers;
ALTER PUBLICATION supabase_realtime ADD TABLE interaction_logs;
