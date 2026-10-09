<?php
/**
 * /api/index.php — front-controller shim (Contentine Create)
 * Bridges the webroot to the out-of-webroot PHP backend.
 *
 * Topology: this file lives at <webroot>/api/ and the backend sits as a
 * sibling of the webroot, so dirname(__DIR__, 2) is the webroot's parent:
 *   dirname(__DIR__, 2) + /backend/public/index.php
 *
 * It is part of the deploy artifact: unlike a symlink, it survives every rsync.
 */
$entry = dirname(__DIR__, 2) . '/backend/public/index.php';
if (!is_file($entry)) {
    http_response_code(503);
    header('Content-Type: application/json');
    echo json_encode(['error' => 'backend_entry_not_found', 'hint' => 'check webroot/backend layout']);
    exit;
}
require $entry;
