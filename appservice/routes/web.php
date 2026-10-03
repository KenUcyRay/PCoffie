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

    // Identitas publik aplikasi TANPA login (nama, slogan, logo, favicon).
    // Sengaja endpoint khusus (bukan dispatcher umum) supaya tidak ada
    // model/metode lain yang bisa dipanggil tanpa token.
    $router->post('/public/app-setting', 'C_home@public_setting');

    // =====================================================================
    //  PORTAL PEMBELI (/tiket-app/)
    //  Dispatcher khusus (bukan pola umum) supaya tidak ada model/method
    //  backend lain yang bisa dipanggil dari portal.
    //  - prefix portal/public  : TANPA login, hanya data layak publik
    //  - prefix portal         : WAJIB login (middleware jwt)
    // =====================================================================
    $router->group(['prefix' => 'portal/public'], function () use ($router) {
        $router->post('/home', 'C_portal@public_home');
        $router->post('/events', 'C_portal@public_events');
        $router->post('/event', 'C_portal@public_event');
        $router->post('/categories', 'C_portal@public_categories');
        $router->post('/cities', 'C_portal@public_cities');
        $router->post('/news', 'C_portal@public_news');
        $router->post('/news/detail', 'C_portal@public_news_detail');
        $router->post('/promos', 'C_portal@public_promos');
        $router->post('/products', 'C_portal@public_products');
        $router->post('/product', 'C_portal@public_product');
        $router->post('/ad/view', 'C_portal@public_ad_view');
        $router->post('/ad/click', 'C_portal@public_ad_click');
        // Daftar akun pembeli baru (GROUP_USER)
        $router->post('/auth/register', 'C_portal@register');
        // Kurir + tarif ongkos kirim tetap (publik, supaya halaman checkout bisa menampilkannya)
        $router->post('/couriers', 'C_portal@public_couriers');
    });

    $router->group(['prefix' => 'portal', 'middleware' => 'jwt'], function () use ($router) {
        $router->post('/whoami', 'C_portal@whoami');

        // Pesanan tiket
        $router->post('/order/preview', 'C_portal@order_preview');
        $router->post('/order/create', 'C_portal@order_create');
        $router->post('/order/list', 'C_portal@order_list');
        $router->post('/order/detail', 'C_portal@order_detail');
        $router->post('/order/cancel', 'C_portal@order_cancel');

        // Tiket saya
        $router->post('/ticket/list', 'C_portal@my_tickets');

        // Refund
        $router->post('/refund/check', 'C_portal@refund_check');
        $router->post('/refund/apply', 'C_portal@refund_apply');
        $router->post('/refund/list', 'C_portal@refund_list');

        // Merchandise
        $router->post('/cart', 'C_portal@cart');
        $router->post('/merch/order', 'C_portal@merch_order_create');
        $router->post('/purchase/list', 'C_portal@purchase_list');
        $router->post('/purchase/detail', 'C_portal@purchase_detail');
        $router->post('/purchase/cancel', 'C_portal@purchase_cancel');
        $router->post('/purchase/receive', 'C_portal@purchase_receive');
        $router->post('/purchase/complaint', 'C_portal@purchase_complaint');

        // Riwayat baca saja
        $router->post('/payment/list', 'C_portal@payment_list');
        $router->post('/invoice/list', 'C_portal@invoice_list');

        // Profil (data, ganti password, sesi sendiri, inbox)
        $router->post('/profile', 'C_portal@profile');
    });

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