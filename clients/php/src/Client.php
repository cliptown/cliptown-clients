<?php
declare(strict_types=1);
namespace ZedPkg\Cliptown;
final readonly class Client {
    public function __construct(public string $baseUrl, public ?string $bearerToken = null) {}
}
