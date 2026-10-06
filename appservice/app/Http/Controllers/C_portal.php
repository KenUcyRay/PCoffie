<?php

namespace App\Http\Controllers;

use App\Models\Mportal;
use Illuminate\Http\Request;

class C_portal extends Controller
{
    private static function send(array $result)
    {
        $http = (int) ($result['__http'] ?? 200);
        unset($result['__http']);
        return response($result, $http)->header('Content-Type', 'application/json');
    }

    public function public_home(Request $r)
    {
        return self::send(Mportal::home($r->all()));
    }

    public function public_cities(Request $r)
    {
        return self::send(Mportal::cities($r->all()));
    }

    public function register(Request $r)
    {
        return self::send(Mportal::register($r->all()));
    }

    public function whoami(Request $r)
    {
        return self::send(Mportal::whoami($r->all()));
    }

    public function profile(Request $r)
    {
        return self::send(Mportal::profile($r->all()));
    }

    public function warnetPakets(Request $r) { return self::send(Mportal::warnetPakets($r->all())); }
    public function warnetPcs(Request $r) { return self::send(Mportal::warnetPcs($r->all())); }
    public function warnetBookingRequest(Request $r) { return self::send(Mportal::warnetBookingRequest($r->all())); }
    public function warnetMyBookings(Request $r) { return self::send(Mportal::warnetMyBookings($r->all())); }
    public function warnetBookingCancel(Request $r) { return self::send(Mportal::warnetBookingCancel($r->all())); }
}
