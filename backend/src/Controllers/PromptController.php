<?php

declare(strict_types=1);

namespace Contentine\Controllers;

/** Serves industry prompt templates from the frontend data directory. */
class PromptController
{
    /** GET /api/prompts/industries — Return the contents of industry-prompts.json. */
    public function industries(array $params, array $body): void
    {
        $filePath = __DIR__ . '/../../../../frontend/src/data/industry-prompts.json';

        if (!file_exists($filePath)) {
            echo json_encode([]);
            return;
        }

        $contents = file_get_contents($filePath);

        if ($contents === false) {
            error_log("Failed to read industry prompts file: {$filePath}");
            echo json_encode([]);
            return;
        }

        $data = json_decode($contents, true);

        if (json_last_error() !== JSON_ERROR_NONE) {
            error_log("Invalid JSON in industry prompts file: " . json_last_error_msg());
            echo json_encode([]);
            return;
        }

        echo json_encode($data);
    }
}
