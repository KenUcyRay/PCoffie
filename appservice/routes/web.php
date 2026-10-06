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
    $router->get('/auth/me', 'C_home@auth');
    $router->post('/auth/me', 'C_home@auth');

    $router->post('/public/app-setting', 'C_home@public_setting');

    $router->group(['prefix' => 'portal/public'], function () use ($router) {
        $router->post('/home', 'C_portal@public_home');
        $router->post('/cities', 'C_portal@public_cities');
        $router->post('/auth/register', 'C_portal@register');
        $router->post('/warnet-pakets', 'C_portal@warnetPakets');
        $router->post('/warnet-pcs', 'C_portal@warnetPcs');
    });

    $router->group(['prefix' => 'portal', 'middleware' => 'jwt'], function () use ($router) {
        $router->post('/whoami', 'C_portal@whoami');
        $router->post('/profile', 'C_portal@profile');
        $router->post('/warnet-booking-request', 'C_portal@warnetBookingRequest');
        $router->post('/warnet-my-bookings', 'C_portal@warnetMyBookings');
        $router->post('/warnet-booking-cancel', 'C_portal@warnetBookingCancel');
    });

    $router->group(['middleware' => 'jwt'], function () use ($router) {
        $router->post('/logout', 'C_home@logout');
        $router->get('/logout', 'C_home@logout');
        $router->post('/auth/logout', 'C_home@logout');
        $router->post('/home/{A}/{B}', 'C_home@general');
        $router->post('/{A}/{B}', 'C_home@general');
    });
});
