// One-time seed: the E-Board roster that used to be hardcoded in eboard.html,
// so the first read of the 'content' blob (see portal-content.mjs) carries
// over the real bios instead of starting blank.
export const CONTENT_SEED = {
  siteText: {
    'home.whatIs.heading': 'What is Rowan ACDA?',
    'home.whatIs.description': "The Rowan American Choral Directors Association's mission is to create opportunities for students to learn more about an array of different choral techniques and aspects that will enrich and supplement their education. This includes fundraising, holding events and activities that either interest or inform members, and bringing in presenters from on and off-campus to hold workshops and masterclasses. Our goal is to allow everyone to learn about and experience choral music while acquiring various choral directing skills.",
    'home.choralEngagement.description': "Did you love choir in High School? Want to sing in a growing choral community of many majors? Join Rowan's own \"Choir Club\"! Rowan's chapter of the American Choral Directors Association is committed to providing musically engaging choral experiences for students of all skill levels. Join us on Fridays at 3:00pm in Wilson 107!",
    'home.sightReading.description': "Our chapter hosts themed weekly sight-reading sessions for students to grow their aural music theory skills. Students will have the opportunity to sing a broad range of repertoire in sessions hosted by our executive board. Everyone is encouraged to bring their own material for the group to read with prior approval!",
    'home.development.description': "In sessions coordinated by our Vice President, industry professionals will present development sessions on varying relevant topics in the modern Choral Direction and Education field. The chapter also facilitates student and faculty led workshops on conducting, sight-reading techniques, and other choral skills per the Chapter's interests and needs.",
    'events.bannerSubtext': 'Performances, Volunteer Opportunities, Meetings, and Workshops',
    'members.join.description': 'Open to all Rowan students who love choral music. Join on ProfLink to get involved!',
    'members.about.description': "Rowan ACDA is a student-run community where singers, future educators, and developing musicians grow together. We rehearse, read new music, host conducting labs, and invite guest clinicians to share practical tools you can use in choral career.\n\nWhether you're preparing for a career in music or simply love to sing, you'll find welcoming rehearsals, hands-on workshops, and plenty of ways to serve the campus and local community.",
    'members.mission.description': 'To cultivate choral artistry, leadership, and service by providing inclusive music-making, practical training, and professional connections for all Rowan students.',
    'members.eventsActivities.description': 'We plan a balanced mix of artistry, growth, and service throughout the year:',
  },
  resources: {
    pd: [],
    showAndTell: [],
  },
  merch: [
    {
      id: 'tshirt-original', name: 'T-Shirt', price: 15.00,
      sizes: ['Small', 'Medium', 'Large', 'X-Large', 'XX-Large'],
      photos: ['/assets/img/merch-tshirt-model.jpg', '/assets/img/merch-tshirt-flat.jpg', '/assets/img/merch-tshirt-folded.jpg'],
      active: true,
    },
  ],
  eboard: [
    {
      id: 'makayli-matias', name: 'Makayli Matias', role: 'President',
      email: 'matias85@rowan.edu', photo: '/assets/img/makayli-matias.jpg',
      desc: 'Leads meetings and represents the chapter.',
      bio: "Makayli Matias is a junior studying Vocal Music Education, now serving as President of Rowan's ACDA chapter after previously serving as Secretary. She leads meetings and represents the chapter, building on her experience managing communication and point totals for the organization. Makayli sings with both the Concert Choir and Voces ensemble and is also a member of Rowan's Opera Company. Most recently, she was seen as the Dew Fairy in Hansel and Gretel. She looks forward to continuing to grow as a musician and leader through her involvement at Rowan.",
    },
    {
      id: 'lizzie-hitchner', name: 'Lizzie Hitchner', role: 'Vice President',
      email: 'hitchn55@rowan.edu', photo: '/assets/img/lizzie-hitchner.jpg',
      desc: 'Supports the president and helps with club activities.',
      bio: "Lizzie Hitchner is a sophomore Vocal Music Education major and currently serves as the Vice President of Rowan's ACDA chapter. In this role, she collaborates with the e-board to plan and organize professional development opportunities, as well as chapter events/trips. Lizzie is an active member of Rowan's Concert Choir and is also involved with local theater companies and a marching band, contributing her skills in both performance and production.",
    },
    {
      id: 'adam-bretz', name: 'Adam Bretz', role: 'Treasurer',
      email: 'bretza67@students.rowan.edu', photo: '/assets/img/adam-bretz.jpg',
      desc: "Oversees the club's finances and plans fundraisers.",
      bio: 'Adam Bretz is a senior Electrical & Computer Engineering major with a minor in music (Organ), now serving as Treasurer. He oversees the club\'s finances and helps plan fundraisers, and also maintains the chapter\'s website.',
    },
    {
      id: 'sadie-frame', name: 'Sadie Frame', role: 'Secretary',
      email: 'frames27@rowan.edu', photo: '/assets/img/sadie-frame.jpg',
      desc: 'Manages communication and tracks point totals.',
      bio: "Sadie Frame is a Sophomore studying Vocal Music Education while serving this year as ACDA's Secretary for the 2026-2027 school year! Sadie is an advocate for the arts and music education. She has worked hard and gained numerous opportunities to proudly perform with esteemed choir ensembles including: All South Jersey Chorus, NJ All State Treble Chorus, All Eastern Treble Chorus, and most recently, Rowan's University Chorus. Sadie's main priority for this chapter is to manage communication and keeping track of points totals for our members. Sadie hopes to continue to develop her skills not only as a performer, but leader and educator, and hopes to see ACDA and its members flourish this year!",
    },
    {
      id: 'jessenia-zavala', name: 'Jessenia Zavala', role: 'Event Coordinator',
      email: 'zavala34@students.rowan.edu', photo: '/assets/img/jessenia-zavala.jpg',
      desc: "Plans and coordinates ACDA's events.",
      bio: "Jessenia Zavala is a senior Vocal Music Education major at Rowan University, now serving as Event Coordinator for ACDA. In this role, she plans and coordinates the chapter's events, including trips and outings to opera performances. Jessenia also serves as Treasurer for NAfME, is a proud member of Tri Alpha, sings with Concert Choir, and studies voice with Professor Marian Stieber. She has previously performed with Rowan's Opera Company, appearing as the Sandman in Hansel and Gretel and performing in the Fall Opera Scenes. Jessenia has also performed in several productions at Ocean County College, including All Shook Up, Kiss Me Kate, and Broadway for the Holidays 2 & 3.",
    },
    {
      id: 'vera-caruso', name: 'Vera Caruso', role: 'Social Media Coordinator',
      email: 'caruso83@students.rowan.edu', photo: '/assets/img/vera-caruso.jpg',
      desc: "Manages the club's social media and photo archives.",
      bio: 'Vera Caruso is a senior vocal BA and English BA double major. She also holds a CUGs in jazz performance. She is involved with several ensembles at Rowan, such as the Rowan Opera Company, Concert Choir, and Voces chamber ensemble. As social media coordinator, she manages the organization\'s social media accounts and photo archives.',
    },
    {
      id: 'dan-suiliguin', name: 'Dan Suiliguin', role: 'Senator',
      email: 'suligu56@rowan.edu', photo: '/assets/img/dan-suiliguin.jpg',
      desc: "Represents the club's interests to the school.",
      bio: "Dan Suiliguin is a junior Vocal Music Education student at Rowan University. He is thrilled to be serving as ACDA's Senator, representing the club's interests as NAfME's Student Government representative. In this role, he attends Student Government meetings on behalf of the chapter. He looks forward to assisting many students through his major and as an E-Board member.",
    },
  ],
};
