import gleam/option.{type Option, None, Some}

pub type Client {
  Client(base_url: String, token: Option(String))
}

@external(erlang, "cliptown_gleam_ffi", "request")
fn request_ffi(base_url: String, token: String, method: String, path: String, body: String) -> Result(String, String)

pub fn new(base_url: String, token: Option(String)) -> Client {
  Client(base_url:, token:)
}

pub fn request(client: Client, method: String, path: String, body: String) -> Result(String, String) {
  let Client(base_url, token) = client
  let bearer = case token { Some(value) -> value None -> "" }
  request_ffi(base_url, bearer, method, path, body)
}
