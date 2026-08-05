-module(cliptown_gleam_ffi).
-export([request/5]).

request(Base0, Token, Method0, Path0, Body) ->
    application:ensure_all_started(inets),
    application:ensure_all_started(ssl),
    Base = binary_to_list(Base0),
    Path = binary_to_list(Path0),
    Url = string:trim(Base, trailing, "/") ++ "/" ++ string:trim(Path, leading, "/"),
    Headers0 = [{"accept", "application/json"}],
    Headers = case Token of <<>> -> Headers0; _ -> [{"authorization", "Bearer " ++ binary_to_list(Token)} | Headers0] end,
    Method = list_to_atom(string:lowercase(binary_to_list(Method0))),
    Request = case Body of
        <<>> -> {Url, Headers};
        _ -> {Url, Headers, "application/json", binary_to_list(Body)}
    end,
    case httpc:request(Method, Request, [{autoredirect, false}], [{body_format, binary}]) of
        {ok, {{_, Status, _}, _, Response}} when Status >= 200, Status < 300 -> {ok, Response};
        {ok, {{_, Status, _}, _, Response}} -> {error, iolist_to_binary(io_lib:format("HTTP ~p: ~s", [Status, Response]))};
        {error, Reason} -> {error, iolist_to_binary(io_lib:format("~p", [Reason]))}
    end.
