// Kishu Studio inquiry form: posts to the studio's Google Form backend (owned by hello@kishu.studio).
// Notification + branded auto-reply are sent by the Apps Script bound to that form.
(function(){
  var ACTION='https://docs.google.com/forms/d/e/1FAIpQLSdCTxNJZUI75oQNOeCvb6lJ5So8kAsfryxpfSCTA3VR-k2qtQ/formResponse';
  var MAP={name:'entry.2116335401',email:'entry.836702514',whatsapp:'entry.453675973',business:'entry.1679766935',message:'entry.1004403419',budget:'entry.62331154'};
  var form=document.getElementById('inquiry-form'); if(!form) return;
  form.addEventListener('submit',function(e){
    e.preventDefault();
    var fd=new FormData();
    Object.keys(MAP).forEach(function(k){var el=form.elements[k]; if(el) fd.append(MAP[k], el.value);});
    var btn=form.querySelector('[type=submit]'); if(btn){btn.disabled=true; btn.textContent='Sending…';}
    fetch(ACTION,{method:'POST',mode:'no-cors',body:fd}).finally(function(){
      form.innerHTML='<p class="form-done"><strong>Thank you.</strong> Your message is in. You will get a personal reply within one working day, usually faster. A confirmation is on its way to your email.</p>';
    });
  });
})();
