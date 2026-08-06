const std = @import("std");

pub const Client = struct {
    base_url: []const u8,
    access_token: ?[]const u8 = null,

    pub fn init(base_url: []const u8) !Client {
        if (base_url.len == 0) return error.EmptyBaseUrl;
        return .{ .base_url = base_url };
    }

    pub fn endpoint(self: Client, allocator: std.mem.Allocator, path: []const u8) ![]u8 {
        const trimmed = std.mem.trimLeft(u8, path, "/");
        const separator = if (std.mem.endsWith(u8, self.base_url, "/")) "" else "/";
        return std.fmt.allocPrint(allocator, "{s}{s}{s}", .{ self.base_url, separator, trimmed });
    }
};

test "endpoint joins exactly one slash" {
    const client = try Client.init("https://example.invalid/");
    const value = try client.endpoint(std.testing.allocator, "/v1/transfers");
    defer std.testing.allocator.free(value);
    try std.testing.expectEqualStrings("https://example.invalid/v1/transfers", value);
}
