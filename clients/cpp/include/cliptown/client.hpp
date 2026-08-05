#pragma once

#include <stdexcept>
#include <string>
#include <utility>

namespace cliptown {
class Client {
 public:
  explicit Client(std::string base_url, std::string access_token = {})
      : base_url_(std::move(base_url)), access_token_(std::move(access_token)) {
    if (base_url_.empty()) throw std::invalid_argument("base_url must not be empty");
  }

  [[nodiscard]] std::string endpoint(std::string path) const {
    while (!path.empty() && path.front() == '/') path.erase(path.begin());
    return base_url_ + (base_url_.back() == '/' ? "" : "/") + path;
  }

  [[nodiscard]] const std::string& access_token() const noexcept {
    return access_token_;
  }

 private:
  std::string base_url_;
  std::string access_token_;
};
}  // namespace cliptown
