(() => {
  const websiteId = "a2ffd7ef-6532-4c2c-b569-dfd4706a9e9e";
  const trackerUrl = "https://bh-analytics.app.mintapis.com/script.js";
  const trackerIntegrity =
    "sha384-ZMxgpYfO/phGz4GiYTIZhcauuGKTb2onmOB5gsiigjmBR38DGAmIna5J1Y/dM/13";
  const allowedHosts = new Set(["tag-janitor.app.mintapis.com"]);
  const pages = {
  "/": {
    "url": "/",
    "title": "Tag Janitor"
  },
  "/index.html": {
    "url": "/",
    "title": "Tag Janitor"
  },
  "/privacy": {
    "url": "/privacy",
    "title": "Privacy | Tag Janitor"
  },
  "/privacy.html": {
    "url": "/privacy",
    "title": "Privacy | Tag Janitor"
  },
  "/imprint": {
    "url": "/imprint",
    "title": "Imprint | Tag Janitor"
  },
  "/imprint.html": {
    "url": "/imprint",
    "title": "Imprint | Tag Janitor"
  }
};
  const { hostname, pathname } = window.location;
  const page = pages[pathname];
  const doNotTrackValues = [
    navigator.doNotTrack,
    navigator.msDoNotTrack,
    window.doNotTrack,
  ];
  const doNotTrackEnabled = doNotTrackValues.some((value) =>
    /^(1|yes)$/i.test(String(value || "")),
  );

  if (
    !allowedHosts.has(hostname) ||
    !page ||
    doNotTrackEnabled ||
    navigator.globalPrivacyControl === true
  ) {
    return;
  }

  window.publicSiteUmamiBeforeSend = (type, payload) => {
    if (type !== "event" || !payload || typeof payload !== "object") return false;
    if (
      Object.prototype.hasOwnProperty.call(payload, "name") ||
      Object.prototype.hasOwnProperty.call(payload, "data") ||
      payload.website !== websiteId ||
      payload.url !== page.url
    ) {
      return false;
    }

    return {
      website: websiteId,
      hostname,
      url: page.url,
      title: page.title,
      referrer: "",
    };
  };

  const script = document.createElement("script");
  script.src = trackerUrl;
  script.integrity = trackerIntegrity;
  script.crossOrigin = "anonymous";
  script.referrerPolicy = "no-referrer";
  script.async = true;
  script.dataset.websiteId = websiteId;
  script.dataset.domains = [...allowedHosts].join(",");
  script.dataset.autoTrack = "false";
  script.dataset.doNotTrack = "true";
  script.dataset.excludeSearch = "true";
  script.dataset.excludeHash = "true";
  script.dataset.beforeSend = "publicSiteUmamiBeforeSend";
  script.addEventListener("load", () => {
    if (typeof window.umami?.track !== "function") return;

    window.umami.track({
      website: websiteId,
      hostname,
      url: page.url,
      title: page.title,
      referrer: "",
    });
  });
  document.head.appendChild(script);
})();
