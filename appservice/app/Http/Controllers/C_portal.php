<?php

namespace App\Http\Controllers;

use App\Models\Mportal;
use App\Models\MportalShop;
use Illuminate\Http\Request;

/**
 * C_portal - controller tipis untuk portal pembeli (/tiket-app/).
 *
 * Tidak ada logika bisnis di sini. Semua perhitungan/hak akses ada di model
 * (Mportal / MportalShop) supaya Console dan portal memakai sumber yang sama.
 *
 * Hanya action yang namanya sudah dipetakan di routes/web.php yang bisa
 * dipanggil - tidak ada dispatcher umum dari portal ke model backend lain.
 */
class C_portal extends Controller
{
    /** Terjemahkan kode error internal (mis. 401/429) jadi status HTTP. */
    private static function send(array $result)
    {
        $http = (int) ($result['__http'] ?? 200);
        unset($result['__http']);
        return response($result, $http)->header('Content-Type', 'application/json');
    }

    // ------------------------------------------------------------ publik
    public function public_home(Request $r)
    {
        return self::send(Mportal::home($r->all()));
    }

    public function public_events(Request $r)
    {
        return self::send(Mportal::events($r->all()));
    }

    public function public_event(Request $r)
    {
        return self::send(Mportal::event($r->all()));
    }

    public function public_categories(Request $r)
    {
        return self::send(Mportal::categories($r->all()));
    }

    public function public_cities(Request $r)
    {
        return self::send(Mportal::cities($r->all()));
    }

    public function public_news(Request $r)
    {
        return self::send(Mportal::news_list($r->all()));
    }

    public function public_news_detail(Request $r)
    {
        return self::send(Mportal::news_detail($r->all()));
    }

    public function public_promos(Request $r)
    {
        return self::send(Mportal::promos($r->all()));
    }

    public function public_products(Request $r)
    {
        return self::send(Mportal::products($r->all()));
    }

    public function public_product(Request $r)
    {
        return self::send(Mportal::product($r->all()));
    }

    public function public_ad_view(Request $r)
    {
        return self::send(Mportal::ad_view($r->all()));
    }

    public function public_ad_click(Request $r)
    {
        return self::send(Mportal::ad_click($r->all()));
    }

    public function public_couriers(Request $r)
    {
        return self::send(MportalShop::couriers($r->all()));
    }

    /** Pendaftaran akun pembeli (GROUP_USER). */
    public function register(Request $r)
    {
        return self::send(Mportal::register($r->all()));
    }

    // ---------------------------------------------------------- masuk sesi
    public function whoami(Request $r)
    {
        return self::send(Mportal::whoami($r->all()));
    }

    // ------------------------------------------------------------- tiket
    public function order_preview(Request $r)
    {
        return self::send(Mportal::order_preview($r->all()));
    }

    public function order_create(Request $r)
    {
        return self::send(Mportal::order_create($r->all()));
    }

    public function order_list(Request $r)
    {
        return self::send(Mportal::order_list($r->all()));
    }

    public function order_detail(Request $r)
    {
        return self::send(Mportal::order_detail($r->all()));
    }

    public function order_cancel(Request $r)
    {
        return self::send(Mportal::order_cancel($r->all()));
    }

    public function my_tickets(Request $r)
    {
        return self::send(Mportal::my_tickets($r->all()));
    }

    // ------------------------------------------------------------ refund
    public function refund_check(Request $r)
    {
        return self::send(Mportal::refund_check($r->all()));
    }

    public function refund_apply(Request $r)
    {
        return self::send(Mportal::refund_apply($r->all()));
    }

    public function refund_list(Request $r)
    {
        return self::send(Mportal::refund_list($r->all()));
    }

    // ------------------------------------------------------ merchandise
    public function cart(Request $r)
    {
        return self::send(MportalShop::cart($r->all()));
    }

    public function merch_order_create(Request $r)
    {
        return self::send(MportalShop::order_create($r->all()));
    }

    public function purchase_list(Request $r)
    {
        return self::send(MportalShop::purchase_list($r->all()));
    }

    public function purchase_detail(Request $r)
    {
        return self::send(MportalShop::purchase_detail($r->all()));
    }

    public function purchase_cancel(Request $r)
    {
        return self::send(MportalShop::purchase_cancel($r->all()));
    }

    public function purchase_receive(Request $r)
    {
        return self::send(MportalShop::purchase_receive($r->all()));
    }

    public function purchase_complaint(Request $r)
    {
        return self::send(MportalShop::purchase_complaint($r->all()));
    }

    // ----------------------------------------------------------- riwayat
    public function payment_list(Request $r)
    {
        return self::send(MportalShop::payment_list($r->all()));
    }

    public function invoice_list(Request $r)
    {
        return self::send(MportalShop::invoice_list($r->all()));
    }

    // ------------------------------------------------------------ profil
    public function profile(Request $r)
    {
        return self::send(MportalShop::profile($r->all()));
    }
}