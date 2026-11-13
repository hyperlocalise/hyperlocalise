<?php
/**
 * Maps `Hyperlocalise\WordPress\Foo\BarBaz` to `src/foo/bar-baz.php`.
 */

spl_autoload_register(static function (string $class) {
    $prefix = 'Hyperlocalise\\WordPress\\';
    if (strpos($class, $prefix) !== 0) {
        return;
    }

    $parts = explode('\\', substr($class, strlen($prefix)));
    $parts = array_map(static function (string $part): string {
        return strtolower((string) preg_replace('/(?<!^)[A-Z]/', '-$0', $part));
    }, $parts);

    $path = __DIR__ . '/' . implode('/', $parts) . '.php';
    if (is_file($path)) {
        require_once $path;
    }
});
