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
}
