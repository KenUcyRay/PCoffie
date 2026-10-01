<?php

namespace App\Custom;

use Tymon\JWTAuth\Contracts\JWTSubject;

class userJWT implements JWTSubject
{
  protected $userlogin;
  protected $password;

  public function __construct($userlogin, $password)
  {
    $this->userlogin = $userlogin;
    $this->password = $password;
  }

  public function getJWTIdentifier()
  {
    return $this->userlogin;
  }

  public function getJWTCustomClaims()
  {
    return [];
  }

  public function getUserlogin()
  {
    return $this->userlogin;
  }

  public function getPassword()
  {
    return $this->password;
  }
}