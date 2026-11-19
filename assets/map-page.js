const frame=document.getElementById('movement-map'),status=document.getElementById('map-loading');
frame.addEventListener('load',()=>{try{const d=frame.contentDocument;status.textContent=d?.getElementById('canvas')||d?.querySelector('canvas')?'地図を表示しました。日付や再生ボタンで操作できます。':'地図を読み込めませんでした。「地図を全画面で開く」をお試しください。';}catch{status.textContent='「地図を全画面で開く」からも操作できます。';}});
frame.addEventListener('error',()=>{status.textContent='地図を読み込めませんでした。再読み込みしてください。';});
