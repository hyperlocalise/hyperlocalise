<?php

namespace Hyperlocalise\WordPress\Multilingual;

if (!defined('ABSPATH')) {
    exit;
}

final class Registry
{
    private ?Adapter $active = null;
    private bool $resolved = false;

    /**
     * Returns the first available adapter. Sites with both WPML and Polylang
     * active are unsupported by both plugins, so order only breaks ties for
     * custom adapters added through the filter.
     */
    public function active(): ?Adapter
    {
        if ($this->resolved) {
            return $this->active;
        }
        $this->resolved = true;

        $adapters = apply_filters('hyperlocalise_multilingual_adapters', [
            new WpmlAdapter(),
            new PolylangAdapter(),
        ]);

        foreach ((array) $adapters as $adapter) {
            if ($adapter instanceof Adapter && $adapter->is_available()) {
                $this->active = $adapter;
                break;
            }
        }

        return $this->active;
    }
}
