<?php

/** @var \Laravel\Lumen\Routing\Router $router */

$router->group(['prefix' => 'api/core'], function () use ($router) {

    $router->get('/', 'C_home@index');
    $router->get('/check_db', 'C_home@check_db');

    $router->post('/auth/login', 'C_home@auth');
    $router->get('/reload', 'C_home@auth');
    $router->post('/reload', 'C_home@auth');
    $router->get('/auth/reload', 'C_home@auth');
    $router->post('/auth/reload', 'C_home@auth');
    // alias universal untuk frontend baru (pengganti reload)
    $router->get('/auth/me', 'C_home@auth');
    $router->post('/auth/me', 'C_home@auth');

    $router->group(['middleware' => 'jwt'], function () use ($router) {
        $router->post('/logout', 'C_home@logout');
        $router->get('/logout', 'C_home@logout');
        $router->post('/auth/logout', 'C_home@logout');

        // pola URL frontend: api/core/home/{model}/{method}
        $router->post('/home/{A}/{B}', 'C_home@general');
        // fallback pola lama: api/core/{model}/{method}
        $router->post('/{A}/{B}', 'C_home@general');
    });
});