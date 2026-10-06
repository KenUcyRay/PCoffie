<?php
namespace App\Models;
use Illuminate\Support\Facades\DB;
use Illuminate\Database\Eloquent\Model;
class Mcwarnetbooking extends Model
{
    use ColumnFilter;
    const TABLE='T_WARNET_BOOKING';
    private static function sortMap(): array { return ['BOOKINGID'=>'A.BOOKINGID','BOOKNO'=>'A.BOOKNO','USERLOGIN'=>'A.USERLOGIN','PCNO'=>'C.PCNO','TGL_BOOKING'=>'A.TGL_BOOKING','JAM_MULAI'=>'A.JAM_MULAI','STATUS'=>'A.STATUS','TOTAL'=>'A.TOTAL']; }
    public static function read_data($param){
        $limit=(isset($param['limit'])&&$param['limit']!=='')?(int)$param['limit']:0; $offset=max(0,(int)($param['offset']??0)); $q=trim((string)($param['q']??''));
        [$fWhere,$fArgs]=self::buildColumnFilter($param);
        $where=''; $args=[];
        if($q!==''){ $where=" WHERE (A.BOOKNO LIKE ? OR A.USERLOGIN LIKE ? OR C.PCNO LIKE ? OR P.NAMA LIKE ?)"; $like='%'.$q.'%'; $args=[$like,$like,$like,$like]; }
        $where.=$fWhere; $args=array_merge($args,$fArgs);
        if($where!==''&&stripos(ltrim($where),'WHERE')!==0) $where=' WHERE 1=1'.$where;
        $cnt=DB::selectOne("SELECT COUNT(*) AS TOTAL FROM T_WARNET_BOOKING A LEFT JOIN T_WARNET_PC C ON C.PCID=A.PCID LEFT JOIN T_WARNET_PAKET P ON P.PAKETID=A.PAKETID".$where,$args);
        $total=(int)($cnt->TOTAL ?? 0);
        $map=self::sortMap(); $sk=strtoupper(trim((string)($param['sort']??''))); $dir=strtoupper(trim((string)($param['dir']??'ASC')))==='DESC'?'DESC':'ASC';
        $order=isset($map[$sk])?$map[$sk].' '.$dir:'A.TGL_BOOKING DESC, A.JAM_MULAI DESC';
        $sql="SELECT A.BOOKINGID,A.BOOKNO,A.USERLOGIN,A.PCID,C.PCNO,C.ZONA AS PCZONA,A.PAKETID,P.NAMA AS PAKETNAMA,A.TGL_BOOKING,A.JAM_MULAI,A.JAM_SELESAI,A.DURASI_MENIT,A.TOTAL,A.PAYMETHOD,A.PAYSTATUS,A.STATUS,A.NOTE,A.SYSCREATEUSER,A.SYSCREATEDATE FROM T_WARNET_BOOKING A LEFT JOIN T_WARNET_PC C ON C.PCID=A.PCID LEFT JOIN T_WARNET_PAKET P ON P.PAKETID=A.PAKETID".$where." ORDER BY ".$order;
        if($limit>0) $sql.=" OFFSET ".$offset." ROWS FETCH NEXT ".$limit." ROWS ONLY";
        $rows=DB::select($sql,$args);
        return json_encode(['success'=>true,'Rows'=>$rows,'TotalRows'=>$total]);
    }
    public static function read_users($param){
        $rows=DB::select("SELECT USERLOGIN,USERNAME,USEREMAIL FROM CPUSER WHERE USERGROUP='GROUP_USER' AND USERACTIVE='YES' ORDER BY USERLOGIN");
        return json_encode(['success'=>true,'Rows'=>$rows]);
    }
    private static function nextBookNo(): string {
        $d=date('Ymd'); $c=DB::selectOne("SELECT COUNT(*) AS C FROM T_WARNET_BOOKING WHERE BOOKNO LIKE ?",["BK-".$d."-%"]); $n=((int)($c->C ?? 0))+1;
        return sprintf("BK-%s-%04d",$d,$n);
    }
    private static function overlapExists(int $pcid, string $tgl, string $jamMulai, string $jamSelesai, ?int $excludeId=null): bool {
        $sql="SELECT 1 AS X FROM T_WARNET_BOOKING WHERE PCID=? AND TGL_BOOKING=? AND STATUS IN ('pending','approved','running') AND ? < JAM_SELESAI AND ? > JAM_MULAI";
        $args=[$pcid,$tgl,$jamMulai,$jamSelesai];
        if($excludeId){ $sql.=" AND BOOKINGID<>?"; $args[]=$excludeId; }
        return !empty(DB::select($sql,$args));
    }
    public static function process_create($param){
        $v=json_decode($param['vdata']??'{}',true)?:[];
        $user=strtolower(trim((string)($v['USERLOGIN']??''))); if($user==='') return json_encode(['success'=>'false','message'=>'USERLOGIN wajib.']);
        if(!DB::selectOne("SELECT 1 AS X FROM CPUSER WHERE USERLOGIN=? AND USERGROUP='GROUP_USER'",[$user])) return json_encode(['success'=>'false','message'=>'User tidak ditemukan / bukan GROUP_USER.']);
        $pcid=(int)($v['PCID']??0); $pc=DB::selectOne("SELECT PCID,HARGA_PERJAM FROM T_WARNET_PC WHERE PCID=? AND ISAKTIF='YES'",[$pcid]); if(!$pc) return json_encode(['success'=>'false','message'=>'PC tidak ditemukan.']);
        $paketId=isset($v['PAKETID'])&&$v['PAKETID']!==''?(int)$v['PAKETID']:null;
        $paket=null; if($paketId){ $paket=DB::selectOne("SELECT PAKETID,HARGA,DURASI_MENIT FROM T_WARNET_PAKET WHERE PAKETID=? AND ISAKTIF='YES'",[$paketId]); if(!$paket) return json_encode(['success'=>'false','message'=>'Paket tidak ditemukan.']); }
        $tgl=trim((string)($v['TGL_BOOKING']??'')); if(!preg_match('/^\d{4}-\d{2}-\d{2}$/',$tgl)) return json_encode(['success'=>'false','message'=>'Tanggal tidak valid.']);
        $jam=trim((string)($v['JAM_MULAI']??'')); if(!preg_match('/^\d{2}:\d{2}(:\d{2})?$/',$jam)) return json_encode(['success'=>'false','message'=>'Jam mulai tidak valid.']); $jam=substr($jam,0,5).':00';
        $dur=(int)($v['DURASI_MENIT']??0); if($dur<15||$dur>720) return json_encode(['success'=>'false','message'=>'Durasi 15-720 menit.']);
        $end=date('H:i:s',strtotime($jam)+$dur*60);
        if(self::overlapExists($pcid,$tgl,$jam,$end)) return json_encode(['success'=>'false','message'=>'PC bentrok pada jadwal tersebut.']);
        $pay=strtolower(trim((string)($v['PAYMETHOD']??'qris'))); if(!in_array($pay,['qris','transfer','cash'])) $pay='qris';
        if($paket) $total=(float)$paket->HARGA; else $total=(float)$pc->HARGA_PERJAM * ceil($dur/60);
        $bookNo=self::nextBookNo();
        $status='approved';
        DB::insert("INSERT INTO T_WARNET_BOOKING (BOOKNO,USERLOGIN,PCID,PAKETID,TGL_BOOKING,JAM_MULAI,JAM_SELESAI,DURASI_MENIT,TOTAL,PAYMETHOD,PAYSTATUS,STATUS,SYSCREATEUSER,SYSCREATEDATE) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,GETDATE())",
            [$bookNo,$user,$pcid,$paketId,$tgl,$jam,$end,$dur,$total,$pay,'pending',$status,$param['VUSERLOGIN']??'']);
        AuditTrail::log(['action'=>'CREATE','mcontrol'=>'cp_booking','page'=>'Booking','table'=>'T_WARNET_BOOKING','dataId'=>$bookNo,'summary'=>'BOOKNO '.$bookNo,'before'=>[],'after'=>$v,'userlogin'=>$param['VUSERLOGIN']??'']);
        return json_encode(['success'=>'true','message'=>'Booking dibuat: '.$bookNo,'BookNo'=>$bookNo]);
    }
    public static function process_update($param){
        $v=json_decode($param['vdata']??'{}',true)?:[]; $id=(int)($v['BOOKINGID']??0);
        $row=DB::selectOne("SELECT * FROM T_WARNET_BOOKING WHERE BOOKINGID=?",[$id]); if(!$row) return json_encode(['success'=>'false','message'=>'Booking tidak ditemukan.']);
        if(in_array($row->STATUS,['done','cancel'])) return json_encode(['success'=>'false','message'=>'Booking sudah selesai/batal, tidak bisa ubah.']);
        $pcid=(int)($v['PCID']??$row->PCID); $tgl=trim((string)($v['TGL_BOOKING']??$row->TGL_BOOKING)); $jam=trim((string)($v['JAM_MULAI']??$row->JAM_MULAI)); $jam=substr($jam,0,5).':00'; $dur=(int)($v['DURASI_MENIT']??$row->DURASI_MENIT);
        $end=date('H:i:s',strtotime($jam)+$dur*60);
        if(self::overlapExists($pcid,$tgl,$jam,$end,$id)) return json_encode(['success'=>'false','message'=>'PC bentrok pada jadwal tersebut.']);
        $paketId=isset($v['PAKETID'])?($v['PAKETID']===''?null:(int)$v['PAKETID']):$row->PAKETID;
        $pc=DB::selectOne("SELECT HARGA_PERJAM FROM T_WARNET_PC WHERE PCID=?",[$pcid]); $total=0;
        if($paketId){ $pk=DB::selectOne("SELECT HARGA FROM T_WARNET_PAKET WHERE PAKETID=?",[$paketId]); $total=$pk?(float)$pk->HARGA:(float)$pc->HARGA_PERJAM*ceil($dur/60); } else $total=(float)$pc->HARGA_PERJAM*ceil($dur/60);
        DB::update("UPDATE T_WARNET_BOOKING SET PCID=?,PAKETID=?,TGL_BOOKING=?,JAM_MULAI=?,JAM_SELESAI=?,DURASI_MENIT=?,TOTAL=?,PAYMETHOD=?,NOTE=?,SYSUPDATEUSER=?,SYSUPDATEDATE=GETDATE() WHERE BOOKINGID=?",
            [$pcid,$paketId,$tgl,$jam,$end,$dur,$total,strtolower(trim((string)($v['PAYMETHOD']??$row->PAYMETHOD))),trim((string)($v['NOTE']??$row->NOTE)),$param['VUSERLOGIN']??'',$id]);
        AuditTrail::log(['action'=>'UPDATE','mcontrol'=>'cp_booking','page'=>'Booking','table'=>'T_WARNET_BOOKING','dataId'=>$row->BOOKNO,'summary'=>'BOOKNO '.$row->BOOKNO,'before'=>(array)$row,'after'=>$v,'userlogin'=>$param['VUSERLOGIN']??'']);
        return json_encode(['success'=>'true','message'=>'Booking diupdate.']);
    }
    public static function change_status($param){
        $v=json_decode($param['vdata']??'{}',true)?:[]; $id=(int)($v['BOOKINGID']??0); $to=strtolower(trim((string)($v['STATUS']??'')));
        $row=DB::selectOne("SELECT * FROM T_WARNET_BOOKING WHERE BOOKINGID=?",[$id]); if(!$row) return json_encode(['success'=>'false','message'=>'Booking tidak ditemukan.']);
        $allowed=['pending'=>['approved','cancel'],'approved'=>['running','cancel'],'running'=>['done','cancel']];
        $from=strtolower($row->STATUS);
        if(!isset($allowed[$from])||!in_array($to,$allowed[$from])) return json_encode(['success'=>'false','message'=>'Transisi '.$row->STATUS.' -> '.$to.' tidak diizinkan.']);
        DB::update("UPDATE T_WARNET_BOOKING SET STATUS=?,PAYSTATUS=?,SYSUPDATEUSER=?,SYSUPDATEDATE=GETDATE() WHERE BOOKINGID=?",[$to,$to==='approved'?'pending':($to==='done'?'paid':$row->PAYSTATUS),$param['VUSERLOGIN']??'',$id]);
        if($to==='cancel') DB::update("UPDATE T_WARNET_BOOKING SET PAYSTATUS='cancel' WHERE BOOKINGID=?",[$id]);
        AuditTrail::log(['action'=>'STATUS','mcontrol'=>'cp_booking','page'=>'Booking','table'=>'T_WARNET_BOOKING','dataId'=>$row->BOOKNO,'summary'=>$row->BOOKNO.' '.$from.'->'.$to,'before'=>['STATUS'=>$from],'after'=>['STATUS'=>$to],'userlogin'=>$param['VUSERLOGIN']??'']);
        return json_encode(['success'=>'true','message'=>'Status -> '.$to]);
    }
    public static function process_delete($param){
        $v=json_decode($param['vdata']??'{}',true)?:[]; $id=(int)($v['BOOKINGID']??0);
        $row=DB::selectOne("SELECT BOOKNO,STATUS FROM T_WARNET_BOOKING WHERE BOOKINGID=?",[$id]); if(!$row) return json_encode(['success'=>'false','message'=>'Booking tidak ditemukan.']);
        if(!in_array(strtolower($row->STATUS),['pending','cancel'])) return json_encode(['success'=>'false','message'=>'Hanya pending/cancel yang boleh dihapus.']);
        DB::delete("DELETE FROM T_WARNET_BOOKING WHERE BOOKINGID=?",[$id]);
        AuditTrail::log(['action'=>'DELETE','mcontrol'=>'cp_booking','page'=>'Booking','table'=>'T_WARNET_BOOKING','dataId'=>$row->BOOKNO,'summary'=>'BOOKNO '.$row->BOOKNO,'before'=>(array)$row,'after'=>[],'userlogin'=>$param['VUSERLOGIN']??'']);
        return json_encode(['success'=>'true','message'=>'Booking dihapus.']);
    }
}
