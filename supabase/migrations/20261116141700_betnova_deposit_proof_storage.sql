insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('deposit-proofs','deposit-proofs',false,5242880,array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict(id) do update set public=false,file_size_limit=5242880,allowed_mime_types=excluded.allowed_mime_types;
drop policy if exists "Users upload own deposit proofs" on storage.objects;
create policy "Users upload own deposit proofs" on storage.objects for insert to authenticated
with check(bucket_id='deposit-proofs' and (storage.foldername(name))[1]=(select auth.uid())::text);
drop policy if exists "Users read own deposit proofs" on storage.objects;
create policy "Users read own deposit proofs" on storage.objects for select to authenticated
using(bucket_id='deposit-proofs' and (storage.foldername(name))[1]=(select auth.uid())::text);
drop policy if exists "Admins read deposit proofs" on storage.objects;
create policy "Admins read deposit proofs" on storage.objects for select to authenticated
using(bucket_id='deposit-proofs' and exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.role='admin'));
