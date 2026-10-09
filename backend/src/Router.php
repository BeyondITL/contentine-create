<?php

declare(strict_types=1);

namespace Contentine;

class Router
{
    private array $routes = [];

    public function get(string $path, string $handler): void
    {
        $this->routes['GET'][] = ['path' => $path, 'handler' => $handler];
    }

    public function post(string $path, string $handler): void
    {
        $this->routes['POST'][] = ['path' => $path, 'handler' => $handler];
    }

    public function put(string $path, string $handler): void
    {
        $this->routes['PUT'][] = ['path' => $path, 'handler' => $handler];
    }

    public function delete(string $path, string $handler): void
    {
        $this->routes['DELETE'][] = ['path' => $path, 'handler' => $handler];
    }

    /**
     * Register RESTful resource routes
     */
    public function resource(string $path, string $controller, ?string $methodPrefix = null): void
    {
        $prefix = $methodPrefix ? $methodPrefix : '';
        $indexMethod = $prefix ? "{$prefix}Index" : 'index';
        $storeMethod = $prefix ? "{$prefix}Store" : 'store';
        $showMethod = $prefix ? "{$prefix}Show" : 'show';
        $updateMethod = $prefix ? "{$prefix}Update" : 'update';
        $destroyMethod = $prefix ? "{$prefix}Destroy" : 'destroy';

        $this->get($path, "{$controller}@{$indexMethod}");
        $this->post($path, "{$controller}@{$storeMethod}");
        $this->get("{$path}/{id}", "{$controller}@{$showMethod}");
        $this->put("{$path}/{id}", "{$controller}@{$updateMethod}");
        $this->delete("{$path}/{id}", "{$controller}@{$destroyMethod}");
    }

    public function dispatch(string $method, string $uri): void
    {
        $uri = parse_url($uri, PHP_URL_PATH);
        $uri = rtrim($uri, '/');

        $routes = $this->routes[$method] ?? [];

        foreach ($routes as $route) {
            $params = $this->match($route['path'], $uri);
            if ($params !== false) {
                $this->call($route['handler'], $params);
                return;
            }
        }

        http_response_code(404);
        echo json_encode(['error' => 'Not found', 'path' => $uri]);
    }

    private function match(string $pattern, string $uri): array|false
    {
        $pattern = rtrim($pattern, '/');
        $patternParts = explode('/', $pattern);
        $uriParts = explode('/', $uri);

        if (count($patternParts) !== count($uriParts)) {
            return false;
        }

        $params = [];
        foreach ($patternParts as $i => $part) {
            if (str_starts_with($part, '{') && str_ends_with($part, '}')) {
                $paramName = trim($part, '{}');
                $params[$paramName] = $uriParts[$i];
            } elseif ($part !== $uriParts[$i]) {
                return false;
            }
        }

        return $params;
    }

    private function call(string $handler, array $params): void
    {
        [$controllerName, $method] = explode('@', $handler);

        $controllerClass = "Contentine\\Controllers\\{$controllerName}";

        if (!class_exists($controllerClass)) {
            $file = __DIR__ . "/Controllers/{$controllerName}.php";
            if (file_exists($file)) {
                require_once $file;
            }
        }

        if (!class_exists($controllerClass)) {
            http_response_code(500);
            echo json_encode(['error' => "Controller {$controllerName} not found"]);
            return;
        }

        $controller = new $controllerClass();
        $body = json_decode(file_get_contents('php://input'), true) ?? [];

        $controller->$method($params, $body);
    }
}
