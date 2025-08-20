const EVENTS = [
  {
    "title": "Sight Singing Musical Theatre & Cabaret Rehearsal",
    "type": "General Meeting",
    "date": "2025-09-12",
    "time": "3:00pm - 4:00pm",
    "short": "Sight sing your favorite musical theatre harmonies, then rehearse for our Cabaret!",
    "long": "Join us for a fun session of sight singing where we\u2019ll explore ensemble harmonies from well-loved musical theatre repertoire. Whether you\u2019re new to sight singing or just want more practice, this is a great way to build confidence in a relaxed setting. Afterward, we\u2019ll rehearse our group piece for the upcoming Cabaret, so come ready to sing, learn, and connect with others!",
    "image": "https://loving-newyork.com/wp-content/uploads/2018/12/musicals-broadway-shows-new-york.jpg"
  },
  {
    "title": "PD #1",
    "type": "PD",
    "date": "2025-09-19",
    "time": "3:00pm - 4:00pm",
    "short": "",
    "long": "",
    "image": ""
  },
  {
    "title": "Cabaret Auditions",
    "type": "Auditions",
    "date": "2025-09-26",
    "time": "3:00pm - 4:00pm",
    "short": "Audition for our annual Cabaret\u2014any style, any act, all are welcome!",
    "long": "Do you have a talent you\u2019re ready to share? Our Cabaret auditions are open to all kinds of performances\u2014vocal, instrumental, solo, duet, or group. This is your chance to shine on stage at our annual Cabaret on October 10th, one of the most exciting events of the semester. No matter your style, we\u2019d love to see what you bring to the stage!",
    "image": "https://www.wilmingtoncityschools.com/media/site/wilmington-high-school-news/auditions-669.jpeg"
  },
  {
    "title": "Church Gig 101 & Cabaret Rehearsal #2",
    "type": "General Meeting",
    "date": "2025-10-03",
    "time": "3:00pm - 4:00pm",
    "short": "Learn the ins and outs of preparing for a church gig, then rehearse for our Cabaret!",
    "long": "If you\u2019ve ever wondered how church gigs work, this session is for you! We\u2019ll cover the basics of sight singing, service structure, and professional etiquette, plus tips for success from those who\u2019ve done it before. Whether you\u2019re interested in picking up church jobs or want to strengthen your skills for future opportunities, you\u2019ll leave with practical knowledge and confidence. Afterward, we\u2019ll rehearse our group piece for the upcoming Cabaret!",
    "image": "https://www.encirclephotos.com/wp-content/uploads/Sweden-Malmo-Sankt-Petri-Church-Choir-Sing-1440x961.jpg"
  },
  {
    "title": "Cabaret Dress Rehearsal",
    "type": "Dress Rehearsal",
    "date": "2025-10-10",
    "time": "3:00pm - 5:00pm",
    "short": "Final run-through before Cabaret\u2014polish your act and rehearse the group song together!",
    "long": "Our Cabaret Dress Rehearsal is the last opportunity for performers to run through their acts in full before the show. We\u2019ll practice transitions, get last-minute feedback, and rehearse the group song so everyone feels performance-ready.",
    "image": "https://i.ytimg.com/vi/4EHbp1ohHuo/maxresdefault.jpg"
  },
  {
    "title": "Cabaret Performance",
    "type": "Performance",
    "date": "2025-10-10",
    "time": "7:00pm - 9:00pm",
    "short": "Don\u2019t miss our annual Cabaret showcasing Rowan talent!",
    "long": "An evening full of talent, energy, and community\u2014come cheer on your peers and experience the magic of live performance!",
    "image": "https://rowantrumpetprof.com/wp-content/uploads/2014/05/boyd-recital-hall.jpg"
  },
  {
    "title": "PD #2",
    "type": "PD",
    "date": "2025-10-17",
    "time": "3:00pm - 4:00pm",
    "short": "",
    "long": "",
    "image": ""
  },
  {
    "title": "Emily Dickinson in Art Song",
    "type": "Performance",
    "date": "2025-10-23",
    "time": "7:30pm - 9:30pm",
    "short": "Rowan students join Lyric Fest artists for an evening of Emily Dickinson-inspired art song.",
    "long": "A special collaboration featuring poetry in song.",
    "image": "https://th.bing.com/th/id/OIP.TXzDVyGdtrISTjnZyc9poAHaJo?o=7rm=3&rs=1&pid=ImgDetMain&o=7&rm=3"
  },
  {
    "title": "Concert Choir",
    "type": "Performance",
    "date": "2025-10-25",
    "time": "7:30pm - 9:30pm",
    "short": "Hear Rowan\u2019s Concert Choir in a powerful performance!",
    "long": "An evening of choral music highlighting classic repertoire and exciting newer works under Dr. Christopher Thomas.",
    "image": "https://i.ytimg.com/vi/N61VWGXr2VA/maxresdefault.jpg"
  },
  {
    "title": "Pumpkin Painting & Root Beer Floats (NAfME x ACDA)",
    "type": "Collab",
    "date": "2025-10-31",
    "time": "3:00pm - 4:00pm",
    "short": "Paint pumpkins and enjoy root beer floats at our fall collab event!",
    "long": "Relax, paint a festive pumpkin, and sip a root beer float while hanging with friends\u2014get into the autumn spirit.",
    "image": "https://th.bing.com/th/id/R.303fd54a12878999d756a35dd4e13d8d?rik=ZowkRkIR1HAx6w&pid=ImgRaw&r=0"
  },
  {
    "title": "Learn Latin American Music",
    "type": "General Meeting",
    "date": "2025-11-07",
    "time": "3:00pm - 4:00pm",
    "short": "Discover and sing a beautiful piece of Latin American choral music.",
    "long": "We\u2019ll explore the composer and cultural background, then bring the music to life through singing.",
    "image": "https://images.squarespace-cdn.com/content/v1/631d1798c001211985a44cce/4ea306eb-a830-4747-b6d7-c21a62801034/7a3db0_5f0d2463952d46468ceefa48b82690b2-2.jpg"
  },
  {
    "title": "Choral Conducting 101 (with Dr. Thomas)",
    "type": "PD",
    "date": "2025-11-14",
    "time": "3:00pm - 4:00pm",
    "short": "Learn the basics of choral conducting with Dr. Christopher Thomas.",
    "long": "Fundamentals of gesture, communication, and rehearsal strategies\u2014with a chance to try it yourself.",
    "image": "https://bostonconservatory.berklee.edu/sites/default/files/styles/scale_and_crop_16_9_large/public/d7/bcm/program_images/BCB-conducting.jpg?itok=qmb4iP1s"
  },
  {
    "title": "Rowan Opera Company: Fall Opera Collage (Night 1)",
    "type": "Performance",
    "date": "2025-11-21",
    "time": "7:30pm - 9:30pm",
    "short": "A collage of opera scenes performed by the Rowan Opera Company.",
    "long": "Scenes and arias from across the operatic repertoire in a dynamic performance.",
    "image": "https://today.rowan.edu/news/2025/01/images/cpa-springarts-2025.jpg"
  },
  {
    "title": "Rowan Opera Company: Fall Opera Collage (Night 2)",
    "type": "Performance",
    "date": "2025-11-22",
    "time": "7:30pm - 9:30pm",
    "short": "Encore night of the Opera Collage by the Rowan Opera Company.",
    "long": "A second opportunity to experience drama and beauty of opera scenes.",
    "image": "https://today.rowan.edu/news/2025/01/images/cpa-springarts-2025.jpg"
  },
  {
    "title": "Rowan University Chorus & Voces Chamber Ensemble",
    "type": "Performance",
    "date": "2025-11-25",
    "time": "7:30pm - 9:30pm",
    "short": "Hear Rowan University Chorus and Voces Chamber Ensemble in one evening.",
    "long": "Two vibrant choral ensembles share a dynamic and varied program.",
    "image": "https://web.ovationtix.com/trs/api/rest/ClientFile(584589)"
  },
  {
    "title": "Mozart\u2019s Requiem: Concert Choir & Symphony Orchestra",
    "type": "Performance",
    "date": "2025-12-06",
    "time": "7:30pm - 9:30pm",
    "short": "Experience Mozart\u2019s Requiem performed by the Concert Choir and Symphony Orchestra.",
    "long": "A moving and unforgettable evening under Dr. Christopher Thomas.",
    "image": "https://web.ovationtix.com/trs/api/rest/ClientFile(584591)"
  }
];

(function(){
  function htmlEscape(s){return (s||"").replace(/[&<>"']/g,m=>({ "&":"&amp;","<":"&lt;",">":"&gt;",""":"&quot;","'":"&#39;" }[m]));}
  const grid = document.querySelector("#events-grid");
  const q = document.querySelector("#q");
  const typeTags = document.querySelectorAll("[data-type]");
  const monthSel = document.querySelector("#month");
  const whenSel = document.querySelector("#when");

  function parseISO(d){ try { return new Date(d + "T12:00:00"); } catch(e){ return new Date(); } }
  function fmtDate(d){
    return d.toLocaleDateString(undefined, { year:"numeric", month:"long", day:"numeric" });
  }

  function activeTypes(){
    return Array.from(typeTags).filter(el=>el.classList.contains("active")).map(el=>el.dataset.type);
  }

  function render(list){
    grid.innerHTML = "";
    if(list.length===0){
      grid.innerHTML = '<div class="empty">No events match your filters.</div>';
      return;
    }
    list.forEach(ev=>{
      const d = parseISO(ev.date);
      const card = document.createElement("article");
      card.className = "card";
      const img = ev.image ? `<img loading="lazy" src="${htmlEscape(ev.image)}" alt="">` : "";
      card.innerHTML = `
        ${img}
        <div class="body">
          <div class="chips"><span class="chip">${htmlEscape(ev.type)}</span></div>
          <h3>${htmlEscape(ev.title)}</h3>
          <div class="meta">
            <span>${fmtDate(d)}</span>
            <span>•</span>
            <span>${htmlEscape(ev.time||"")}</span>
          </div>
          <p>${htmlEscape(ev.short||"")}</p>
        </div>`;
      grid.appendChild(card);
    });
  }

  function apply(){
    const query = (q.value||"").toLowerCase();
    const types = activeTypes();
    const month = monthSel.value; // "" or "01".."12"
    const when = whenSel.value; // all|upcoming|past
    const now = new Date();

    let list = EVENTS.slice().sort((a,b)=> a.date.localeCompare(b.date));

    list = list.filter(ev=>{
      const d = parseISO(ev.date);
      if(when==="upcoming" && d < now) return false;
      if(when==="past" && d >= now) return false;
      if(month && (String(d.getMonth()+1).padStart(2,"0")!==month)) return false;
      if(types.length && !types.includes(ev.type)) return false;

      const hay = (ev.title + " " + (ev.short||"") + " " + (ev.long||"") + " " + (ev.type||"")).toLowerCase();
      if(query && !hay.includes(query)) return false;
      return true;
    });

    render(list);
  }

  // Interactions
  q?.addEventListener("input", apply);
  monthSel?.addEventListener("change", apply);
  whenSel?.addEventListener("change", apply);
  typeTags.forEach(t=> t.addEventListener("click", ()=>{ t.classList.toggle("active"); apply(); }));

  // Initial render
  apply();
})();
