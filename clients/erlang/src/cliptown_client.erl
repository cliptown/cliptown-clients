-module(cliptown_client).
-export([request/5]).

request(Base0, Token0, Method, Path0, Body) ->
    application:ensure_all_started(inets),
    application:ensure_all_started(ssl),
    Base = to_list(Base0), Path = to_list(Path0), Token = to_list(Token0),
    Url = string:trim(Base, trailing, "/") ++ "/" ++ string:trim(Path, leading, "/"),
    Headers0 = [{"accept", "application/json"}],
    Headers = case Token of [] -> Headers0; _ -> [{"authorization", "Bearer " ++ Token} | Headers0] end,
    Request = case Body of undefined -> {Url, Headers}; _ -> {Url, Headers, "application/json", jsx:encode(Body)} end,
    case httpc:request(Method, Request, [{autoredirect, false}], [{body_format, binary}]) of
        {ok, {{_, Status, _}, ResponseHeaders, Response}} when Status >= 200, Status < 300 -> {ok, Status, ResponseHeaders, Response};
        {ok, {{_, Status, _}, _, Response}} -> {error, Status, Response};
        {error, Reason} -> {error, Reason}
    end.

to_list(Value) when is_binary(Value) -> binary_to_list(Value);
to_list(Value) when is_list(Value) -> Value.
