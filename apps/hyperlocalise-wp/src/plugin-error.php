<?php

namespace Hyperlocalise\WordPress;

if (!defined('ABSPATH')) {
    exit;
}

final class PluginError extends \RuntimeException
{
    private string $error_code;
    private int $status;

    public function __construct(string $error_code, string $message, int $status = 0)
    {
        parent::__construct($message);
        $this->error_code = $error_code;
        $this->status = $status;
    }

    public function error_code(): string
    {
        return $this->error_code;
    }

    public function status(): int
    {
        return $this->status;
    }
}
