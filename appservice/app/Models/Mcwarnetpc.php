<?php
namespace App\Models;
use Illuminate\Support\Facades\DB;
use Illuminate\Database\Eloquent\Model;
class Mcwarnetpc extends Model
{
    use ColumnFilter;
    const TABLE='T_WARNET_PC';
    private static function sortMap(): array { return ['PCID'=>'A.PCID','PCNO'=>'A.PCNO','ZONA'=>'A.ZONA','HARGA_PERJAM'=>'A.HARGA_PERJAM','STATUS'=>'A.STATUS','ISAKTIF'=>'A.ISAKTIF','SORTNO'=>'A.SORTNO']; }
    public static function read_data($param){
        $limit=(isset($param['limit'])&&$param['limit']!=='')?(int)$param['limit']:0; $offset=max(0,(int)($param['offset']??0)); $q=trim((string)($param['q']??''));
        [$fWhere,$fArgs]=self::buildColumnFilter($param);
        $where=''; $args=[];
        if($q!==''){ $where=" WHERE (A.PCNO LIKE ? OR A.SPEK LIKE ? OR A.ZONA LIKE ?)"; $like='%'.$q.'%'; $args=[$like,$like,$like]; }
        $where.=$fWhere; $args=array_merge($args,$fArgs);
        if($where!==''&&stripos(ltrim($where),'WHERE')!==0) $where=' WHERE 1=1'.$where;
        $total=(int)(DB::selectOne("SELECT COUNT(*) AS TOTAL FROM T_WARNET_PC A".$where,$args)->TOTAL ?? 0);
        $map=self::sortMap(); $sk=strtoupper(trim((string)($param['sort']??''))); $dir=strtoupper(trim((string)($param['dir']??'ASC')))==='DESC'?'DESC':'ASC';
        $order=isset($map[$sk])?$map[$sk].' '.$dir:'A.SORTNO, A.PCNO';
        $sql="SELECT A.PCID,A.PCNO,A.ZONA,A.SPEK,A.HARGA_PERJAM,A.STATUS,A.ISAKTIF,A.SORTNO FROM T_WARNET_PC A".$where." ORDER BY ".$order;
        if($limit>0) $sql.=" OFFSET ".$offset." ROWS FETCH NEXT ".$limit." ROWS ONLY";
        return json_encode(['success'=>true,'Rows'=>DB::select($sql,$args),'TotalRows'=>$total]);
    }
    public static function read_active($param){
        $rows=DB::select("SELECT PCID,PCNO,ZONA,SPEK,HARGA_PERJAM,STATUS FROM T_WARNET_PC WHERE ISAKTIF='YES' ORDER BY SORTNO,PCNO");
        return json_encode(['success'=>true,'Rows'=>$rows]);
    }
    public static function available($param){
        $tgl=trim((string)($param['tgl']??'')); $jam=trim((string)($param['jam']??'')); $dur=(int)($param['dur']??0);
        if($tgl===''||$jam===''||$dur<=0) return json_encode(['success'=>'false','message'=>'tgl/jam/dur required']);
        $end=date('H:i:s',strtotime($jam)+$dur*60);
        $busyIds=array_map(fn($r)=>(int)$r->PCID, DB::select("SELECT PCID FROM T_WARNET_BOOKING WHERE TGL_BOOKING=? AND STATUS IN ('pending','approved','running') AND ? < JAM_SELESAI AND ? > JAM_MULAI",[$tgl,$jam,$end]) ?: []);
        $rows=DB::select("SELECT PCID,PCNO,ZONA,SPEK,HARGA_PERJAM,STATUS FROM T_WARNET_PC WHERE ISAKTIF='YES' ORDER BY SORTNO,PCNO");
        foreach($rows as $r){ $r->AVAILABLE = in_array((int)$r->PCID,$busyIds)||$r->STATUS!=='ready' ? 'NO':'YES'; $r->BUSY_REASON = in_array((int)$r->PCID,$busyIds)?'booked':($r->STATUS!=='ready'?$r->STATUS:''); }
        return json_encode(['success'=>true,'Rows'=>$rows]);
    }
    private static function validate($v,$excludeId=null): ?string {
        $pcno=trim((string)($v['PCNO']??'')); if($pcno==='') return 'PCNO wajib diisi.'; if(strlen($pcno)>20) return 'PCNO maks 20.';
        $zona=strtoupper(trim((string)($v['ZONA']??'REGULER'))); if(!in_array($zona,['REGULER','VIP','VVIP'])) return 'Zona REGULER/VIP/VVIP.';
        $harga=(float)($v['HARGA_PERJAM']??-1); if($harga<0) return 'Harga tidak valid.';
        $status=strtolower(trim((string)($v['STATUS']??'ready'))); if(!in_array($status,['ready','busy','maint'])) return 'Status ready/busy/maint.';
        $sql="SELECT 1 AS X FROM T_WARNET_PC WHERE UPPER(PCNO)=UPPER(?)"; $args=[$pcno]; if($excludeId){ $sql.=" AND PCID<>?"; $args[]=$excludeId; }
        if(!empty(DB::select($sql,$args))) return 'PCNO sudah dipakai.';
        return null;
    }
    public static function process_create($param){
        $v=json_decode($param['vdata']??'{}',true)?:[];
        if(($e=self::validate($v))!==null) return json_encode(['success'=>'false','message'=>$e]);
        DB::insert("INSERT INTO T_WARNET_PC (PCNO,ZONA,SPEK,HARGA_PERJAM,STATUS,ISAKTIF,SORTNO,SYSCREATEUSER,SYSCREATEDATE) VALUES (?,?,?,?,?,?, ?,?,GETDATE())",
            [trim($v['PCNO']),strtoupper(trim($v['ZONA']??'REGULER')),trim((string)($v['SPEK']??'')),(float)$v['HARGA_PERJAM'],strtolower(trim($v['STATUS']??'ready')),strtoupper(trim((string)($v['ISAKTIF']??'YES')))==='NO'?'NO':'YES',(int)($v['SORTNO']??0),$param['VUSERLOGIN']??'']);
        AuditTrail::log(['action'=>'CREATE','mcontrol'=>'cp_pc','page'=>'PC','table'=>'T_WARNET_PC','dataId'=>trim($v['PCNO']),'summary'=>'PCNO '.trim($v['PCNO']),'before'=>[],'after'=>$v,'userlogin'=>$param['VUSERLOGIN']??'']);
        return json_encode(['success'=>'true','message'=>'PC dibuat.']);
    }
    public static function process_update($param){
        $v=json_decode($param['vdata']??'{}',true)?:[]; $id=$v['PCID']??null;
        if(empty($id)) return json_encode(['success'=>'false','message'=>'PCID tidak ditemukan.']);
        if(($e=self::validate($v,$id))!==null) return json_encode(['success'=>'false','message'=>$e]);
        $before=DB::selectOne("SELECT * FROM T_WARNET_PC WHERE PCID=?",[$id]);
        DB::update("UPDATE T_WARNET_PC SET PCNO=?,ZONA=?,SPEK=?,HARGA_PERJAM=?,STATUS=?,ISAKTIF=?,SORTNO=?,SYSUPDATEUSER=?,SYSUPDATEDATE=GETDATE() WHERE PCID=?",
            [trim($v['PCNO']),strtoupper(trim($v['ZONA']??'REGULER')),trim((string)($v['SPEK']??'')),(float)$v['HARGA_PERJAM'],strtolower(trim($v['STATUS']??'ready')),strtoupper(trim((string)($v['ISAKTIF']??'YES')))==='NO'?'NO':'YES',(int)($v['SORTNO']??0),$param['VUSERLOGIN']??'',$id]);
        AuditTrail::log(['action'=>'UPDATE','mcontrol'=>'cp_pc','page'=>'PC','table'=>'T_WARNET_PC','dataId'=>$id,'summary'=>'PCID '.$id,'before'=>$before?(array)$before:[],'after'=>$v,'userlogin'=>$param['VUSERLOGIN']??'']);
        return json_encode(['success'=>'true','message'=>'PC diupdate.']);
    }
    public static function change_status($param){
        $v=json_decode($param['vdata']??'{}',true)?:[]; $id=$v['PCID']??null; $a=strtoupper(trim((string)($v['ISAKTIF']??'')));
        if(empty($id)) return json_encode(['success'=>'false','message'=>'PCID tidak ditemukan.']);
        if(!in_array($a,['YES','NO'])) return json_encode(['success'=>'false','message'=>'Status harus YES/NO.']);
        DB::update("UPDATE T_WARNET_PC SET ISAKTIF=?,SYSUPDATEUSER=?,SYSUPDATEDATE=GETDATE() WHERE PCID=?",[$a,$param['VUSERLOGIN']??'',$id]);
        return json_encode(['success'=>'true','message'=>$a==='YES'?'PC diaktifkan.':'PC dinonaktifkan.']);
    }
    public static function process_delete($param){
        $v=json_decode($param['vdata']??'{}',true)?:[]; $id=$v['PCID']??null;
        if(empty($id)) return json_encode(['success'=>'false','message'=>'PCID tidak ditemukan.']);
        if(DB::selectOne("SELECT 1 AS X FROM T_WARNET_BOOKING WHERE PCID=? AND STATUS IN ('pending','approved','running')",[$id])) return json_encode(['success'=>'false','message'=>'PC masih ada booking aktif, nonaktifkan saja.']);
        $before=DB::selectOne("SELECT PCID,PCNO FROM T_WARNET_PC WHERE PCID=?",[$id]);
        DB::delete("DELETE FROM T_WARNET_PC WHERE PCID=?",[$id]);
        AuditTrail::log(['action'=>'DELETE','mcontrol'=>'cp_pc','page'=>'PC','table'=>'T_WARNET_PC','dataId'=>$id,'summary'=>'PCID '.$id,'before'=>$before?(array)$before:[],'after'=>[],'userlogin'=>$param['VUSERLOGIN']??'']);
        return json_encode(['success'=>'true','message'=>'PC dihapus.']);
    }
}
