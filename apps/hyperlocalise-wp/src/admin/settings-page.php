<?php

namespace Hyperlocalise\WordPress\Admin;

use Hyperlocalise\WordPress\PluginError;
use Hyperlocalise\WordPress\Settings;
use Hyperlocalise\WordPress\TranslationService;

if (!defined('ABSPATH')) {
    exit;
}

final class SettingsPage
{
    public const SLUG = 'hyperlocalise';
    public const PROJECTS_TRANSIENT = 'hyperlocalise_projects';
    private const GROUP = 'hyperlocalise';
    private const REQUIRED_PERMISSIONS = ['files:read', 'files:write', 'jobs:read', 'jobs:write'];

    private Settings $settings;
    private TranslationService $service;

    public function __construct(Settings $settings, TranslationService $service)
    {
        $this->settings = $settings;
        $this->service = $service;
    }

    public function register(): void
    {
        add_action('admin_menu', [$this, 'add_page']);
        add_action('admin_init', [$this, 'register_setting']);
        add_filter('plugin_action_links_' . plugin_basename(HYPERLOCALISE_PLUGIN_FILE), [$this, 'action_links']);
    }

    public function add_page(): void
    {
        $hook = add_options_page(
            __('Hyperlocalise', 'hyperlocalise'),
            __('Hyperlocalise', 'hyperlocalise'),
            'manage_options',
            self::SLUG,
            [$this, 'render']
        );
        add_action('admin_print_styles-' . $hook, static function () {
            wp_enqueue_style('hyperlocalise-admin', HYPERLOCALISE_PLUGIN_URL . 'assets/admin.css', [], HYPERLOCALISE_VERSION);
        });
    }

    public function register_setting(): void
    {
        register_setting(self::GROUP, Settings::OPTION, [
            'type' => 'array',
            'sanitize_callback' => [$this->settings, 'sanitize'],
            'default' => Settings::defaults(),
        ]);
    }

    /**
     * @param string[] $links
     * @return string[]
     */
    public function action_links(array $links): array
    {
        array_unshift($links, sprintf(
            '<a href="%s">%s</a>',
            esc_url(admin_url('options-general.php?page=' . self::SLUG)),
            esc_html__('Settings', 'hyperlocalise')
        ));
        return $links;
    }

    public function render(): void
    {
        if (!current_user_can('manage_options')) {
            return;
        }
        $values = $this->settings->all();
        $name = Settings::OPTION;
        ?>
        <div class="wrap hyperlocalise-settings">
            <h1><?php esc_html_e('Hyperlocalise', 'hyperlocalise'); ?></h1>
            <?php settings_errors(Settings::OPTION); ?>
            <form method="post" action="options.php">
                <?php settings_fields(self::GROUP); ?>

                <h2><?php esc_html_e('Connection', 'hyperlocalise'); ?></h2>
                <?php $this->render_connection_status(); ?>
                <table class="form-table" role="presentation">
                    <tr>
                        <th scope="row"><label for="hyperlocalise-api-key"><?php esc_html_e('Personal access token', 'hyperlocalise'); ?></label></th>
                        <td>
                            <?php if ($this->settings->api_key_from_constant()) : ?>
                                <p><?php echo wp_kses_post(__('Set by the <code>HYPERLOCALISE_API_KEY</code> constant in <code>wp-config.php</code>.', 'hyperlocalise')); ?></p>
                            <?php else : ?>
                                <input type="password" id="hyperlocalise-api-key" class="regular-text" autocomplete="off"
                                    name="<?php echo esc_attr($name); ?>[api_key]" value=""
                                    placeholder="<?php echo esc_attr($values['api_key'] !== '' ? __('Saved. Enter a new token to replace it.', 'hyperlocalise') : ''); ?>">
                                <?php if ($values['api_key'] !== '') : ?>
                                    <label><input type="checkbox" name="<?php echo esc_attr($name); ?>[clear_api_key]" value="1"> <?php esc_html_e('Remove saved token', 'hyperlocalise'); ?></label>
                                <?php endif; ?>
                                <p class="description"><?php esc_html_e('Create a personal access token in Hyperlocalise under Settings with files and jobs permissions.', 'hyperlocalise'); ?></p>
                            <?php endif; ?>
                        </td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="hyperlocalise-project"><?php esc_html_e('Project', 'hyperlocalise'); ?></label></th>
                        <td><?php $this->render_project_field($name, (string) $values['project_id']); ?></td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="hyperlocalise-app-url"><?php esc_html_e('Platform URL', 'hyperlocalise'); ?></label></th>
                        <td><input type="url" id="hyperlocalise-app-url" class="regular-text" name="<?php echo esc_attr($name); ?>[app_url]" value="<?php echo esc_attr((string) $values['app_url']); ?>"></td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="hyperlocalise-api-url"><?php esc_html_e('API URL', 'hyperlocalise'); ?></label></th>
                        <td>
                            <input type="url" id="hyperlocalise-api-url" class="regular-text" name="<?php echo esc_attr($name); ?>[api_url]" value="<?php echo esc_attr((string) $values['api_url']); ?>">
                            <p class="description"><?php esc_html_e('Change these only for a self-hosted or staging Hyperlocalise environment.', 'hyperlocalise'); ?></p>
                        </td>
                    </tr>
                </table>

                <h2><?php esc_html_e('Languages', 'hyperlocalise'); ?></h2>
                <?php $this->render_language_map(); ?>
                <table class="form-table" role="presentation">
                    <tr>
                        <th scope="row"><label for="hyperlocalise-locale-overrides"><?php esc_html_e('Locale overrides', 'hyperlocalise'); ?></label></th>
                        <td>
                            <textarea id="hyperlocalise-locale-overrides" class="large-text code" rows="3" name="<?php echo esc_attr($name); ?>[locale_overrides]"><?php echo esc_textarea((string) $values['locale_overrides']); ?></textarea>
                            <p class="description"><?php echo wp_kses_post(__('One per line, as <code>site-language = project-locale</code>. Example: <code>pt = pt-BR</code>.', 'hyperlocalise')); ?></p>
                        </td>
                    </tr>
                </table>

                <h2><?php esc_html_e('Content', 'hyperlocalise'); ?></h2>
                <table class="form-table" role="presentation">
                    <tr>
                        <th scope="row"><?php esc_html_e('Post types', 'hyperlocalise'); ?></th>
                        <td><?php $this->render_post_types($name, (array) $values['post_types']); ?></td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="hyperlocalise-meta-keys"><?php esc_html_e('Custom fields', 'hyperlocalise'); ?></label></th>
                        <td>
                            <textarea id="hyperlocalise-meta-keys" class="large-text code" rows="5" name="<?php echo esc_attr($name); ?>[meta_keys]"><?php echo esc_textarea((string) $values['meta_keys']); ?></textarea>
                            <p class="description"><?php esc_html_e('Text custom field keys to translate, one per line. The defaults cover Yoast SEO and Rank Math titles and descriptions.', 'hyperlocalise'); ?></p>
                        </td>
                    </tr>
                    <tr>
                        <th scope="row"><?php esc_html_e('Published translations', 'hyperlocalise'); ?></th>
                        <td>
                            <fieldset>
                                <label><input type="radio" name="<?php echo esc_attr($name); ?>[published_translations]" value="<?php echo esc_attr(Settings::PUBLISHED_SKIP); ?>" <?php checked($values['published_translations'], Settings::PUBLISHED_SKIP); ?>> <?php esc_html_e('Keep published translations unchanged', 'hyperlocalise'); ?></label><br>
                                <label><input type="radio" name="<?php echo esc_attr($name); ?>[published_translations]" value="<?php echo esc_attr(Settings::PUBLISHED_UPDATE); ?>" <?php checked($values['published_translations'], Settings::PUBLISHED_UPDATE); ?>> <?php esc_html_e('Overwrite published translations', 'hyperlocalise'); ?></label>
                            </fieldset>
                            <p class="description"><?php esc_html_e('New translations are always created as drafts.', 'hyperlocalise'); ?></p>
                        </td>
                    </tr>
                    <tr>
                        <th scope="row"><?php esc_html_e('Automatic saving', 'hyperlocalise'); ?></th>
                        <td>
                            <label><input type="checkbox" name="<?php echo esc_attr($name); ?>[auto_apply]" value="1" <?php checked((bool) $values['auto_apply']); ?>> <?php esc_html_e('Save translations when a job finishes', 'hyperlocalise'); ?></label>
                            <p class="description"><?php esc_html_e('WP-Cron checks running jobs every five minutes.', 'hyperlocalise'); ?></p>
                        </td>
                    </tr>
                </table>

                <?php submit_button(); ?>
            </form>
        </div>
        <?php
    }

    private function render_connection_status(): void
    {
        if ($this->settings->api_key() === '') {
            return;
        }
        try {
            $principal = $this->settings->client()->me();
        } catch (PluginError $error) {
            $this->notice('error', $error->getMessage());
            return;
        }

        $permissions = array_map('strval', (array) ($principal['permissions'] ?? []));
        $missing = array_diff(self::REQUIRED_PERMISSIONS, $permissions);
        if ($missing !== []) {
            $this->notice('warning', sprintf(
                /* translators: %s: comma-separated permission names */
                __('Connected, but the token is missing these permissions: %s', 'hyperlocalise'),
                implode(', ', $missing)
            ));
            return;
        }
        $this->notice('success', __('Connected to Hyperlocalise.', 'hyperlocalise'));
    }

    private function render_project_field(string $name, string $project_id): void
    {
        $projects = $this->projects();
        if ($projects === null) {
            printf(
                '<input type="text" id="hyperlocalise-project" class="regular-text" name="%1$s[project_id]" value="%2$s">',
                esc_attr($name),
                esc_attr($project_id)
            );
            echo '<p class="description">' . esc_html__('Save a token to choose from your projects, or paste a project ID.', 'hyperlocalise') . '</p>';
            return;
        }

        printf('<select id="hyperlocalise-project" name="%s[project_id]">', esc_attr($name));
        echo '<option value="">' . esc_html__('Choose a project', 'hyperlocalise') . '</option>';
        foreach ($projects as $project) {
            $id = (string) ($project['id'] ?? '');
            if ($id === '' || ($project['source'] ?? 'native') !== 'native') {
                continue;
            }
            printf(
                '<option value="%1$s" %2$s>%3$s (%4$s → %5$s)</option>',
                esc_attr($id),
                selected($id, $project_id, false),
                esc_html((string) ($project['name'] ?? $id)),
                esc_html((string) ($project['sourceLocale'] ?? '?')),
                esc_html(implode(', ', array_map('strval', (array) ($project['targetLocales'] ?? []))))
            );
        }
        echo '</select>';
        echo '<p class="description">' . esc_html__('Only native Hyperlocalise projects are listed.', 'hyperlocalise') . '</p>';
    }

    /**
     * @return array<int, array<string, mixed>>|null
     */
    private function projects(): ?array
    {
        if ($this->settings->api_key() === '') {
            return null;
        }
        $cached = get_transient(self::PROJECTS_TRANSIENT);
        if (is_array($cached)) {
            return $cached;
        }
        try {
            $projects = $this->settings->client()->list_projects();
        } catch (PluginError $error) {
            return null;
        }
        set_transient(self::PROJECTS_TRANSIENT, $projects, 5 * MINUTE_IN_SECONDS);
        return $projects;
    }

    private function render_language_map(): void
    {
        $adapter = $this->service->adapter();
        if ($adapter === null) {
            $this->notice('warning', __('Install and activate WPML or Polylang. Hyperlocalise saves translations through your multilingual plugin.', 'hyperlocalise'));
            return;
        }
        if (!$this->settings->is_configured()) {
            printf(
                '<p>%s</p>',
                esc_html(sprintf(
                    /* translators: %s: multilingual plugin name */
                    __('Using %s. Choose a project to see how site languages map to project locales.', 'hyperlocalise'),
                    $adapter->label()
                ))
            );
            return;
        }

        try {
            $languages = $this->service->language_map();
        } catch (PluginError $error) {
            $this->notice('error', $error->getMessage());
            return;
        }

        printf(
            '<p>%s</p>',
            esc_html(sprintf(
                /* translators: %s: multilingual plugin name */
                __('Using %s.', 'hyperlocalise'),
                $adapter->label()
            ))
        );
        echo '<table class="widefat striped" style="max-width:720px"><thead><tr>';
        echo '<th>' . esc_html__('Site language', 'hyperlocalise') . '</th>';
        echo '<th>' . esc_html__('Project locale', 'hyperlocalise') . '</th>';
        echo '</tr></thead><tbody>';
        foreach ($languages as $language) {
            echo '<tr><td>';
            printf('%1$s <code>%2$s</code>', esc_html($language['name']), esc_html($language['locale']));
            echo '</td><td>';
            if ($language['project_locale'] === null) {
                echo '<em>' . esc_html__('Not in project', 'hyperlocalise') . '</em>';
            } else {
                printf('<code>%s</code>', esc_html($language['project_locale']));
                if ($language['is_source']) {
                    echo ' ' . esc_html__('(source)', 'hyperlocalise');
                }
            }
            echo '</td></tr>';
        }
        echo '</tbody></table>';
    }

    /**
     * @param string[] $selected
     */
    private function render_post_types(string $name, array $selected): void
    {
        $post_types = get_post_types(['show_ui' => true], 'objects');
        unset($post_types['attachment'], $post_types['wp_block'], $post_types['wp_navigation']);

        echo '<fieldset>';
        foreach ($post_types as $post_type) {
            printf(
                '<label><input type="checkbox" name="%1$s[post_types][]" value="%2$s" %3$s> %4$s</label><br>',
                esc_attr($name),
                esc_attr($post_type->name),
                checked(in_array($post_type->name, $selected, true), true, false),
                esc_html($post_type->labels->name)
            );
        }
        echo '</fieldset>';
    }

    private function notice(string $type, string $message): void
    {
        printf(
            '<div class="notice notice-%1$s inline"><p>%2$s</p></div>',
            esc_attr($type),
            esc_html($message)
        );
    }
}
