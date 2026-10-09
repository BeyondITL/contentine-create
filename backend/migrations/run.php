<?php

declare(strict_types=1);

/**
 * Run database migrations.
 * Usage: php migrations/run.php
 */

require_once __DIR__ . '/../vendor/autoload.php';
require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../src/Database.php';

$db = \Contentine\Database::connection();

// Get list of migration files
$files = glob(__DIR__ . '/*.sql');
sort($files);

foreach ($files as $file) {
    $name = basename($file);
    echo "Running migration: {$name}... ";

    $sql = file_get_contents($file);

    // Split on semicolons (handle multi-statement migrations)
    $statements = array_filter(
        array_map('trim', explode(';', $sql)),
        fn($s) => !empty($s) && !str_starts_with($s, '--')
    );

    try {
        foreach ($statements as $statement) {
            $db->exec($statement);
        }
        echo "OK\n";
    } catch (\PDOException $e) {
        // Ignore "table already exists" / "column already exists" errors
        if (str_contains($e->getMessage(), 'already exists')) {
            echo "SKIPPED (already exists)\n";
        } else {
            echo "ERROR: {$e->getMessage()}\n";
        }
    }
}

echo "\nAll migrations complete.\n";
