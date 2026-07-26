pub mod client {
    use cliptown_interfaces_rust::models::Clip;

    pub struct CliptownClient {
        endpoint: String,
    }

    impl CliptownClient {
        pub fn new(endpoint: &str) -> Self {
            Self {
                endpoint: endpoint.to_string(),
            }
        }

        pub async fn get_clips(&self) -> Result<Vec<Clip>, String> {
            Ok(vec![])
        }
    }
}
