<?php

namespace Hyperlocalise\WordPress;

use Hyperlocalise\WordPress\Admin\BulkActions;
use Hyperlocalise\WordPress\Admin\MetaBox;
use Hyperlocalise\WordPress\Admin\Panel;
use Hyperlocalise\WordPress\Admin\SettingsPage;
use Hyperlocalise\WordPress\Multilingual\Registry;

if (!defined('ABSPATH')) {
    exit;
}

final class Plugin
{
    private static ?Plugin $instance = null;
    private bool $booted = false;

    private Settings $settings;
    private TranslationService $service;

    private function __construct()
    {
        $this->settings = new Settings();
        $segmenter = new Segmenter(apply_filters('hyperlocalise_skipped_blocks', Segmenter::DEFAULT_SKIPPED_BLOCKS));
        $this->service = new TranslationService($this->settings, new Registry(), $segmenter);
    }

    public static function instance(): Plugin
    {
        if (self::$instance === null) {
            self::$instance = new Plugin();
        }
        return self::$instance;
    }

    public function service(): TranslationService
    {
        return $this->service;
    }

    public function boot(): void
    {
        if ($this->booted) {
            return;
        }
        $this->booted = true;

        load_plugin_textdomain('hyperlocalise', false, dirname(plugin_basename(HYPERLOCALISE_PLUGIN_FILE)) . '/languages');

        $panel = new Panel($this->service);
        (new Cron($this->service, $this->settings))->register();
        (new RestController($this->service, $this->settings, $panel))->register();

        if (is_admin()) {
            (new SettingsPage($this->settings, $this->service))->register();
            (new MetaBox($this->settings, $panel))->register();
            (new BulkActions($this->settings, $this->service))->register();
        }
    }
}
