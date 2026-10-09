<?php
declare(strict_types=1);

namespace Contentine\Middleware;

/** Input validation and sanitization for all controller inputs. */
class InputValidator
{
    /**
     * Sanitize and validate input against a set of rules.
     * Rules format: ['field' => 'required|string|max:200', 'age' => 'int|min:0|max:150']
     *
     * @param array $input Raw input data.
     * @param array $rules Validation rules keyed by field name.
     * @return array Sanitized data (only fields in rules are returned).
     * @throws \InvalidArgumentException On validation failure.
     */
    public static function sanitize(array $input, array $rules): array
    {
        $sanitized = [];
        $errors = [];

        foreach ($rules as $field => $ruleString) {
            $fieldRules = explode('|', $ruleString);
            $value = $input[$field] ?? null;
            $required = in_array('required', $fieldRules, true);

            // Check required
            if ($required && ($value === null || $value === '')) {
                $errors[] = "{$field} is required";
                continue;
            }

            // Skip optional missing fields
            if ($value === null || $value === '') {
                if (in_array('nullable', $fieldRules, true)) {
                    $sanitized[$field] = null;
                }
                continue;
            }

            // Type validation and sanitization
            foreach ($fieldRules as $rule) {
                if ($rule === 'required' || $rule === 'nullable') continue;

                if ($rule === 'string') {
                    $value = is_string($value) ? strip_tags(trim($value)) : (string) $value;
                } elseif ($rule === 'int' || $rule === 'integer') {
                    if (!is_numeric($value)) {
                        $errors[] = "{$field} must be an integer";
                        continue 2;
                    }
                    $value = (int) $value;
                } elseif ($rule === 'float' || $rule === 'numeric') {
                    if (!is_numeric($value)) {
                        $errors[] = "{$field} must be numeric";
                        continue 2;
                    }
                    $value = (float) $value;
                } elseif ($rule === 'bool' || $rule === 'boolean') {
                    $value = filter_var($value, FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE);
                    if ($value === null) {
                        $errors[] = "{$field} must be a boolean";
                        continue 2;
                    }
                } elseif ($rule === 'email') {
                    $value = filter_var(trim((string) $value), FILTER_VALIDATE_EMAIL);
                    if ($value === false) {
                        $errors[] = "{$field} must be a valid email";
                        continue 2;
                    }
                } elseif ($rule === 'url') {
                    $value = filter_var(trim((string) $value), FILTER_VALIDATE_URL);
                    if ($value === false) {
                        $errors[] = "{$field} must be a valid URL";
                        continue 2;
                    }
                } elseif ($rule === 'array') {
                    if (!is_array($value)) {
                        $errors[] = "{$field} must be an array";
                        continue 2;
                    }
                } elseif ($rule === 'json') {
                    if (is_string($value)) {
                        $decoded = json_decode($value, true);
                        if (json_last_error() !== JSON_ERROR_NONE) {
                            $errors[] = "{$field} must be valid JSON";
                            continue 2;
                        }
                        $value = $decoded;
                    }
                } elseif (str_starts_with($rule, 'max:')) {
                    $max = (int) substr($rule, 4);
                    if (is_string($value) && mb_strlen($value) > $max) {
                        $errors[] = "{$field} must be at most {$max} characters";
                        continue 2;
                    }
                    if (is_numeric($value) && $value > $max) {
                        $errors[] = "{$field} must be at most {$max}";
                        continue 2;
                    }
                } elseif (str_starts_with($rule, 'min:')) {
                    $min = (int) substr($rule, 4);
                    if (is_string($value) && mb_strlen($value) < $min) {
                        $errors[] = "{$field} must be at least {$min} characters";
                        continue 2;
                    }
                    if (is_numeric($value) && $value < $min) {
                        $errors[] = "{$field} must be at least {$min}";
                        continue 2;
                    }
                } elseif (str_starts_with($rule, 'in:')) {
                    $allowed = explode(',', substr($rule, 3));
                    if (!in_array((string) $value, $allowed, true)) {
                        $errors[] = "{$field} must be one of: " . implode(', ', $allowed);
                        continue 2;
                    }
                }
            }

            $sanitized[$field] = $value;
        }

        if (!empty($errors)) {
            http_response_code(422);
            echo json_encode(['error' => 'validation_failed', 'errors' => $errors]);
            exit;
        }

        return $sanitized;
    }

    /** Quick sanitize a single string value (strip tags, trim). */
    public static function cleanString(?string $value, int $maxLength = 500): string
    {
        if ($value === null) return '';
        return mb_substr(strip_tags(trim($value)), 0, $maxLength);
    }
}
