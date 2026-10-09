<?php
declare(strict_types=1);

namespace Contentine\Services;

/**
 * AES-256-GCM encryption service for API keys and OAuth tokens.
 * Master key loaded from admin_config.php (above webroot).
 */
class EncryptionService
{
    private const CIPHER = 'aes-256-gcm';
    private const TAG_LENGTH = 16;

    private string $masterKey;

    public function __construct(?string $masterKey = null)
    {
        if ($masterKey) {
            $this->masterKey = hex2bin($masterKey);
        } else {
            $config = self::loadAdminConfig();
            $this->masterKey = hex2bin($config['ENCRYPTION_MASTER_KEY']);
        }
    }

    /**
     * Encrypt plaintext using AES-256-GCM.
     * @return array{encrypted: string, iv: string, tag: string} All base64-encoded.
     */
    public function encrypt(string $plaintext): array
    {
        $iv = random_bytes(12); // 96-bit IV for GCM
        $tag = '';

        $encrypted = openssl_encrypt(
            $plaintext,
            self::CIPHER,
            $this->masterKey,
            OPENSSL_RAW_DATA,
            $iv,
            $tag,
            '',
            self::TAG_LENGTH
        );

        if ($encrypted === false) {
            throw new \RuntimeException('Encryption failed');
        }

        return [
            'encrypted' => base64_encode($encrypted),
            'iv'        => base64_encode($iv),
            'tag'       => base64_encode($tag),
        ];
    }

    /**
     * Decrypt ciphertext using AES-256-GCM.
     * @param string $encrypted Base64-encoded ciphertext.
     * @param string $iv Base64-encoded IV.
     * @param string $tag Base64-encoded auth tag.
     */
    public function decrypt(string $encrypted, string $iv, string $tag): string
    {
        $decrypted = openssl_decrypt(
            base64_decode($encrypted),
            self::CIPHER,
            $this->masterKey,
            OPENSSL_RAW_DATA,
            base64_decode($iv),
            base64_decode($tag)
        );

        if ($decrypted === false) {
            throw new \RuntimeException('Decryption failed — invalid key, IV, or tampered data');
        }

        return $decrypted;
    }

    /**
     * Load admin_config.php from one directory above document root.
     * Falls back to backend directory for local development.
     */
    public static function loadAdminConfig(): array
    {
        // Production: one dir above document root
        $productionPath = dirname($_SERVER['DOCUMENT_ROOT'] ?? '/var/www/html') . '/admin_config.php';
        if (file_exists($productionPath)) {
            return require $productionPath;
        }

        // Development: in backend root
        $devPath = __DIR__ . '/../../admin_config.php';
        if (file_exists($devPath)) {
            return require $devPath;
        }

        // Fallback: project root
        $rootPath = __DIR__ . '/../../../admin_config.php';
        if (file_exists($rootPath)) {
            return require $rootPath;
        }

        throw new \RuntimeException(
            'admin_config.php not found. Create it above the webroot or in /backend/.'
        );
    }
}
