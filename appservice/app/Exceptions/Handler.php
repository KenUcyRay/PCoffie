<?php

namespace App\Exceptions;

use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Validation\ValidationException;
use Laravel\Lumen\Exceptions\Handler as ExceptionHandler;
use Symfony\Component\HttpKernel\Exception\HttpException;
use Throwable;

class Handler extends ExceptionHandler
{
    /**
     * A list of the exception types that should not be reported.
     *
     * @var array
     */
    protected $dontReport = [
        AuthorizationException::class,
        HttpException::class,
        ModelNotFoundException::class,
        ValidationException::class,
    ];

    /**
     * Report or log an exception.
     *
     * This is a great spot to send exceptions to Sentry, Bugsnag, etc.
     *
     * @param  \Throwable  $exception
     * @return void
     *
     * @throws \Exception
     */
    public function report(Throwable $exception)
    {
        // Catat exception tak tertangani ke T_SYSTEM_LOG (tanpa mengubah respons).
        // Dilewati: validasi biasa, 404/HTTP lain, dan auth (supaya log tidak penuh).
        // SysLog gagal pun tidak boleh melempar (anti perulangan) — sudah dijamin di dalamnya.
        try {
            $skip = $exception instanceof ValidationException
                || $exception instanceof HttpException
                || $exception instanceof ModelNotFoundException
                || $exception instanceof AuthorizationException;
            $code = 0;
            if ($exception instanceof HttpException) {
                $code = (int) $exception->getStatusCode();
            }
            if (!$skip) {
                $fatal = $exception instanceof \Error
                    || $exception instanceof \ParseError
                    || $exception instanceof \TypeError;
                \App\Models\SysLog::log(
                    $fatal ? 'CRITICAL' : 'ERROR',
                    'API',
                    mb_substr(get_class($exception) . ': ' . $exception->getMessage(), 0, 500),
                    [],
                    $exception,
                    $code > 0 ? $code : null
                );
            }
        } catch (\Throwable $ignored) {
            // jangan pernah ganggu alur report bawaan
        }
        parent::report($exception);
    }

    /**
     * Render an exception into an HTTP response.
     *
     * @param  \Illuminate\Http\Request  $request
     * @param  \Throwable  $exception
     * @return \Illuminate\Http\Response|\Illuminate\Http\JsonResponse
     *
     * @throws \Throwable
     */
    public function render($request, Throwable $exception)
    {
        return parent::render($request, $exception);
    }
}
