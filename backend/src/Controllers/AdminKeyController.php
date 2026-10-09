<?php
declare(strict_types=1);

namespace Contentine\Controllers;

use Contentine\Auth;
use Contentine\Services\ApiKeyService;
use Contentine\Middleware\AdminMiddleware;
use Contentine\Middleware\InputValidator;

/** Admin system API key management: services, keys, rotation, usage. */
class AdminKeyController
{
    private ApiKeyService $keyService;

    public function __construct()
    {
        $this->keyService = new ApiKeyService();
    }

    /** GET /api/admin/keys/services — Get all services with key count and health. */
    public function services(array $params, array $body): void
    {
        Auth::requireUser();
        AdminMiddleware::verify();
        echo json_encode(['services' => $this->keyService->getServiceOverview()]);
    }

    /** GET /api/admin/keys/{service} — Get all keys for a service (never decrypted). */
    public function keysForService(array $params, array $body): void
    {
        Auth::requireUser();
        AdminMiddleware::verify();
        $service = $params['service'] ?? '';
        echo json_encode(['keys' => $this->keyService->getKeysForService($service)]);
    }

    /** POST /api/admin/keys/{service} — Add a new key for a service. */
    public function addKey(array $params, array $body): void
    {
        Auth::requireUser();
        AdminMiddleware::verify();

        $service = $params['service'] ?? '';
        $data = InputValidator::sanitize($body, [
            'label'        => 'required|string|max:100',
            'api_key'      => 'required|string|max:500',
            'daily_limit'  => 'nullable|int|min:0',
            'hourly_limit' => 'nullable|int|min:0',
            'priority'     => 'nullable|int|min:0',
        ]);

        $id = $this->keyService->addKey(
            $service,
            $data['label'],
            $data['api_key'],
            (int) ($data['daily_limit'] ?? 0),
            (int) ($data['hourly_limit'] ?? 0),
            (int) ($data['priority'] ?? 0)
        );

        echo json_encode(['id' => $id, 'success' => true]);
    }

    /** PUT /api/admin/keys/key/{id} — Update key settings (limits, priority, active). */
    public function updateKey(array $params, array $body): void
    {
        Auth::requireUser();
        AdminMiddleware::verify();

        $id = (int) ($params['id'] ?? 0);
        $data = InputValidator::sanitize($body, [
            'label'        => 'nullable|string|max:100',
            'daily_limit'  => 'nullable|int|min:0',
            'hourly_limit' => 'nullable|int|min:0',
            'priority'     => 'nullable|int|min:0',
            'is_active'    => 'nullable|bool',
        ]);

        $this->keyService->updateKeySettings($id, array_filter($data, fn($v) => $v !== null));
        echo json_encode(['success' => true]);
    }

    /** POST /api/admin/keys/key/{id}/rotate — Rotate a key with a new value. */
    public function rotateKey(array $params, array $body): void
    {
        Auth::requireUser();
        AdminMiddleware::verify();

        $id = (int) ($params['id'] ?? 0);
        $data = InputValidator::sanitize($body, ['api_key' => 'required|string|max:500']);
        $this->keyService->rotateKey($id, $data['api_key']);
        echo json_encode(['success' => true]);
    }

    /** DELETE /api/admin/keys/key/{id} — Permanently delete a key. */
    public function deleteKey(array $params, array $body): void
    {
        Auth::requireUser();
        AdminMiddleware::verify();

        $id = (int) ($params['id'] ?? 0);
        $this->keyService->deleteKey($id);
        echo json_encode(['success' => true]);
    }

    /** GET /api/admin/keys/{service}/usage — Get usage stats for a service. */
    public function usage(array $params, array $body): void
    {
        Auth::requireUser();
        AdminMiddleware::verify();

        $service = $params['service'] ?? '';
        $period = $_GET['period'] ?? '7d';
        echo json_encode(['usage' => $this->keyService->getUsageStats($service, $period)]);
    }
}
