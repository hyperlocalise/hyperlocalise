<?php

if (!defined('WP_UNINSTALL_PLUGIN')) {
    exit;
}

delete_option('hyperlocalise_settings');
delete_transient('hyperlocalise_project');
delete_transient('hyperlocalise_projects');
wp_clear_scheduled_hook('hyperlocalise_poll_jobs');

delete_post_meta_by_key('_hyperlocalise_job');
delete_post_meta_by_key('_hyperlocalise_job_status');
delete_post_meta_by_key('_hyperlocalise_job_checked');
delete_post_meta_by_key('_hyperlocalise_source_post');
delete_post_meta_by_key('_hyperlocalise_applied_hash');
