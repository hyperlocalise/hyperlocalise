<?php
/**
 * Plugin Name:       Hyperlocalise
 * Plugin URI:        https://hyperlocalise.com
 * Description:       Translate posts and pages with Hyperlocalise and write the results into WPML or Polylang translations.
 * Version:           0.1.0
 * Requires at least: 6.2
 * Requires PHP:      7.4
 * Author:            Hyperlocalise
 * Author URI:        https://hyperlocalise.com
 * License:           GPL-2.0-or-later
 * License URI:       https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain:       hyperlocalise
 * Domain Path:       /languages
 */

if (!defined('ABSPATH')) {
    exit;
}

define('HYPERLOCALISE_VERSION', '0.1.0');
define('HYPERLOCALISE_PLUGIN_FILE', __FILE__);
define('HYPERLOCALISE_PLUGIN_DIR', plugin_dir_path(__FILE__));
define('HYPERLOCALISE_PLUGIN_URL', plugin_dir_url(__FILE__));

require_once HYPERLOCALISE_PLUGIN_DIR . 'src/autoload.php';

register_activation_hook(__FILE__, ['Hyperlocalise\\WordPress\\Cron', 'activate']);
register_deactivation_hook(__FILE__, ['Hyperlocalise\\WordPress\\Cron', 'deactivate']);

add_action('plugins_loaded', static function () {
    Hyperlocalise\WordPress\Plugin::instance()->boot();
});
