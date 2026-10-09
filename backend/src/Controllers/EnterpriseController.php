<?php

declare(strict_types=1);

namespace Contentine\Controllers;

use Contentine\Database;
use Contentine\Middleware\AdminMiddleware;
use Contentine\Middleware\InputValidator;

/** Handles enterprise lead capture and admin lead management. */
class EnterpriseController
{
    /** POST /api/enterprise/contact — Public: validate and save an enterprise lead. */
    public function contact(array $params, array $body): void
    {
        $clean = InputValidator::sanitize($body, [
            'company_name'  => 'string|max:200',
            'contact_name'  => 'string|max:100',
            'contact_email' => 'required|email',
            'phone'         => 'string|max:50',
            'team_size'     => 'string|max:50',
            'message'       => 'string|max:5000',
        ]);

        $id = Database::insert('enterprise_leads', [
            'company_name'  => $clean['company_name'] ?? null,
            'contact_name'  => $clean['contact_name'] ?? null,
            'contact_email' => $clean['contact_email'],
            'phone'         => $clean['phone'] ?? null,
            'team_size'     => $clean['team_size'] ?? null,
            'message'       => $clean['message'] ?? null,
            'status'        => 'new',
        ]);

        http_response_code(201);
        echo json_encode([
            'success' => true,
            'message' => 'Thank you for your interest in Contentine Create Enterprise. Our team will be in touch shortly.',
            'lead_id' => $id,
        ]);
    }

    /** GET /api/admin/enterprise/leads — Admin: list all enterprise leads. */
    public function leads(array $params, array $body): void
    {
        AdminMiddleware::verify();

        $status = isset($_GET['status']) ? InputValidator::cleanString($_GET['status'], 20) : null;

        $where = '1=1';
        $bindings = [];

        if ($status && in_array($status, ['new', 'contacted', 'negotiating', 'closed_won', 'closed_lost'], true)) {
            $where .= ' AND status = ?';
            $bindings[] = $status;
        }

        $leads = Database::fetchAll(
            "SELECT * FROM enterprise_leads WHERE {$where} ORDER BY created_at DESC LIMIT 200",
            $bindings
        );

        echo json_encode([
            'leads' => $leads,
            'total' => count($leads),
        ]);
    }

    /** PUT /api/admin/enterprise/leads/{id} — Admin: update lead status. */
    public function updateLead(array $params, array $body): void
    {
        AdminMiddleware::verify();

        $id = (int) ($params['id'] ?? 0);
        $clean = InputValidator::sanitize($body, [
            'status' => 'required|string|in:new,contacted,negotiating,closed_won,closed_lost',
        ]);

        $lead = Database::fetch('SELECT id FROM enterprise_leads WHERE id = ?', [$id]);
        if (!$lead) {
            http_response_code(404);
            echo json_encode(['error' => 'Lead not found']);
            return;
        }

        Database::update('enterprise_leads', ['status' => $clean['status']], 'id = ?', [$id]);

        $updated = Database::fetch('SELECT * FROM enterprise_leads WHERE id = ?', [$id]);
        echo json_encode(['lead' => $updated]);
    }
}
