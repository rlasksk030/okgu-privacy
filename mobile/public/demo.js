import {koreaDate,shiftDate} from './model.js';
export function demoEvents(){const today=koreaDate();const items=[
 [0,'activities','아침 독서 / 전교생 / 08:40~09:00 / 각 교실 / 담임교사'],
 [0,'activities','학교숲 생태 수업/5·6학년/2~3교시/학교숲/담당교사'],
 [0,'activities','학생자치회 정기 모임 / 학생회 임원 / 13:10 / 자치실 / 담당교사'],
 [0,'activities','교직원 협의회 / 교직원 / 15:00 / 교무실 / 연구부'],
 [0,'trips','교육과정 운영 연수 / 15:30~17:00 / 교육지원청 / 담당교사'],
 [0,'notes','체험학습 참가 신청서 제출 마감'],
 [1,'activities','그림책 작가와의 만남 / 3~6학년 / 10:40 / 도서실 / 담당교사'],
 [1,'activities','학년별 교육과정 협의 / 담임교사 / 15:00 / 교무실 / 연구부'],
 [2,'activities','협력 놀이 수업 / 6학년 / 5~6교시 / 강당 / 담임교사'],
 [3,'notes','교내 행사 준비물 확인'],[4,'activities','함께하는 작은 발표회 / 전교생 / 13:10 / 강당 / 전 교직원'],
 [-1,'notes','다음 주 주간업무계획 확인'],[-3,'activities','학급별 프로젝트 발표 / 6학년 / 3교시 / 교실 / 담임교사']
 ];return items.map(([n,section,text],i)=>({id:'demo-'+i,date:shiftDate(today,n),section,text,revision:'demo',cell:'',line:0}));}
