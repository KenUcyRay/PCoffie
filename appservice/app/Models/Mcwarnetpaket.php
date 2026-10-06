<?php
namespace App\Models;
use Illuminate\Support\Facades\DB;
use Illuminate\Database\Eloquent\Model;
class Mcwarnetpaket extends Model
{
    use ColumnFilter;
    const TABLE = 'T_WARNET_PAKET';
    private static function sortMap(): array {
        return ['PAKETID'=>'A.PAKETID','KODE'=>'A.KODE','NAMA'=>'A.NAMA','ZONA'=>'A.ZONA','DURASI_MENIT'=>'A.DURASI_MENIT','HARGA'=>'A.HARGA','SORTNO'=>'A.SORTNO','ISAKTIF'=>'A.ISAKTIF'];
    }
    public static function read_data($param) {
        $limit=(isset($param['limit'])&&$param['limit']!=='')?(int)$param['limit']:0; $offset=max(0,(int)($param['offset']??0)); $q=trim((string)($param['q']??''));
        [$fWhere,$fArgs]=self::buildColumnFilter($param);
        $where=''; $args=[];
        if($q!==''){ $where=" WHERE (A.KODE LIKE ? OR A.NAMA LIKE ?)"; $like='%'.$q.'%'; $args=[$like,$like]; }
        $where.=$fWhere; $args=array_merge($args,$fArgs);
        if($where!==''&&stripos(ltrim($where),'WHERE')!==0) $where=' WHERE 1=1'.$where;
        $total=(int)(DB::selectOne("SELECT COUNT(*) AS TOTAL FROM T_WARNET_PAKET A".$where,$args)->TOTAL ?? 0);
        $map=self::sortMap(); $sk=strtoupper(trim((string)($param['sort']??''))); $dir=strtoupper(trim((string)($param['dir']??'ASC')))==='DESC'?'DESC':'ASC';
        $order=isset($map[$sk])?$map[$sk].' '.$dir:'A.SORTNO, A.KODE';
        $sql="SELECT A.PAKETID,A.KODE,A.NAMA,A.ZONA,A.DURASI_MENIT,A.HARGA,A.DESKRIPSI,A.ISAKTIF,A.SORTNO FROM T_WARNET_PAKET A".$where." ORDER BY ".$order;
        if($limit>0) $sql.=" OFFSET ".$offset." ROWS FETCH NEXT ".$limit." ROWS ONLY";
        $rows=DB::select($sql,$args);
        return json_encode(['success'=>true,'Rows'=>$rows,'TotalRows'=>$total]);
    }
    public static function read_active($param) {
        $rows=DB::select("SELECT PAKETID,KODE,NAMA,ZONA,DURASI_MENIT,HARGA FROM T_WARNET_PAKET WHERE ISAKTIF='YES' ORDER BY SORTNO,KODE");
        return json_encode(['success'=>true,'Rows'=>$rows]);
    }
    private static function validate($v,$excludeId=null): ?string {
        $kode=trim((string)($v['KODE']??'')); $nama=trim((string)($v['NAMA']??''));
        if($kode===''||$nama==='') return 'Kode dan Nama wajib diisi.';
        if(strlen($kode)>20) return 'Kode maksimal 20.';
        if(strlen($nama)>100) return 'Nama maksimal 100.';
        $zona=strtoupper(trim((string)($v['ZONA']??'REGULER'))); if(!in_array($zona,['REGULER','VIP','VVIP'])) return 'Zona harus REGULER/VIP/VVIP.';
        $dur=(int)($v['DURASI_MENIT']??0); if($dur<15||$dur>1440) return 'Durasi 15-1440 menit.';
        $harga=(float)($v['HARGA']??-1); if($harga<0) return 'Harga tidak valid.';
        $sql="SELECT 1 AS X FROM T_WARNET_PAKET WHERE UPPER(KODE)=UPPER(?)"; $args=[$kode]; if($excludeId){ $sql.=" AND PAKETID<>?"; $args[]=$excludeId; }
        if(!empty(DB::select($sql,$args))) return 'Kode sudah dipakai.';
        return null;
    }
    public static function process_create($param) {
        $v=json_decode($param['vdata']??'{}',true)?:[];
        if(($e=self::validate($v))!==null) return json_encode(['success'=>'false','message'=>$e]);
        DB::insert("INSERT INTO T_WARNET_PAKET (KODE,NAMA,ZONA,DURASI_MENIT,HARGA,DESKRIPSI,ISAKTIF,SORTNO,SYSCREATEUSER,SYSCREATEDATE) VALUES (?,?,?,?,?,?,?, ?,?,GETDATE())",
            [trim($v['KODE']),trim($v['NAMA']),strtoupper(trim($v['ZONA']??'REGULER')),(int)$v['DURASI_MENIT'],(float)$v['HARGA'],trim((string)($v['DESKRIPSI']??'')),strtoupper(trim((string)($v['ISAKTIF']??'YES')))==='NO'?'NO':'YES',(int)($v['SORTNO']??0),$param['VUSERLOGIN']??'']);
        AuditTrail::log(['action'=>'CREATE','mcontrol'=>'cp_paket','page'=>'Paket','table'=>'T_WARNET_PAKET','dataId'=>trim($v['KODE']),'summary'=>'KODE '.trim($v['KODE']),'before'=>[],'after'=>$v,'userlogin'=>$param['VUSERLOGIN']??'']);
        return json_encode(['success'=>'true','message'=>'Paket dibuat.']);
    }
    public static function process_update($param) {
        $v=json_decode($param['vdata']??'{}',true)?:[]; $id=$v['PAKETID']??null;
        if(empty($id)) return json_encode(['success'=>'false','message'=>'PAKETID tidak ditemukan.']);
        if(($e=self::validate($v,$id))!==null) return json_encode(['success'=>'false','message'=>$e]);
        $before=DB::selectOne("SELECT * FROM T_WARNET_PAKET WHERE PAKETID=?",[$id]);
        DB::update("UPDATE T_WARNET_PAKET SET KODE=?,NAMA=?,ZONA=?,DURASI_MENIT=?,HARGA=?,DESKRIPSI=?,ISAKTIF=?,SORTNO=?,SYSUPDATEUSER=?,SYSUPDATEDATE=GETDATE() WHERE PAKETID=?",
            [trim($v['KODE']),trim($v['NAMA']),strtoupper(trim($v['ZONA']??'REGULER')),(int)$v['DURASI_MENIT'],(float)$v['HARGA'],trim((string)($v['DESKRIPSI']??'')),strtoupper(trim((string)($v['ISAKTIF']??'YES')))==='NO'?'NO':'YES',(int)($v['SORTNO']??0),$param['VUSERLOGIN']??'',$id]);
        AuditTrail::log(['action'=>'UPDATE','mcontrol'=>'cp_paket','page'=>'Paket','table'=>'T_WARNET_PAKET','dataId'=>$id,'summary'=>'PAKETID '.$id,'before'=>$before?(array)$before:[],'after'=>$v,'userlogin'=>$param['VUSERLOGIN']??'']);
        return json_encode(['success'=>'true','message'=>'Paket diupdate.']);
    }
    public static function change_status($param) {
        $v=json_decode($param['vdata']??'{}',true)?:[]; $id=$v['PAKETID']??null; $a=strtoupper(trim((string)($v['ISAKTIF']??'')));
        if(empty($id)) return json_encode(['success'=>'false','message'=>'PAKETID tidak ditemukan.']);
        if(!in_array($a,['YES','NO'])) return json_encode(['success'=>'false','message'=>'Status harus YES/NO.']);
        DB::update("UPDATE T_WARNET_PAKET SET ISAKTIF=?,SYSUPDATEUSER=?,SYSUPDATEDATE=GETDATE() WHERE PAKETID=?",[$a,$param['VUSERLOGIN']??'',$id]);
        return json_encode(['success'=>'true','message'=>$a==='YES'?'Paket diaktifkan.':'Paket dinonaktifkan.']);
    }
    public static function process_delete($param) {
        $v=json_decode($param['vdata']??'{}',true)?:[]; $id=$v['PAKETID']??null;
        if(empty($id)) return json_encode(['success'=>'false','message'=>'PAKETID tidak ditemukan.']);
        if(DB::selectOne("SELECT 1 AS X FROM T_WARNET_BOOKING WHERE PAKETID=? AND STATUS<>'cancel'",[$id])) return json_encode(['success'=>'false','message'=>'Paket masih dipakai booking aktif, nonaktifkan saja.']);
        $before=DB::selectOne("SELECT PAKETID,KODE FROM T_WARNET_PAKET WHERE PAKETID=?",[$id]);
        DB::delete("DELETE FROM T_WARNET_PAKET WHERE PAKETID=?",[$id]);
        AuditTrail::log(['action'=>'DELETE','mcontrol'=>'cp_paket','page'=>'Paket','table'=>'T_WARNET_PAKET','dataId'=>$id,'summary'=>'PAKETID '.$id,'before'=>$before?(array)$before:[],'after'=>[],'userlogin'=>$param['VUSERLOGIN']??'']);
        return json_encode(['success'=>'true','message'=>'Paket dihapus.']);
    }
}
