#!/bin/bash

# Replace the section in audit-public-v2.ejs
FILE="server/views/audit-public-v2.ejs"

# Use awk to replace lines 1279-1289 with new content
awk 'NR==1279,NR==1289{
    if(NR==1279){
        print "                        <!-- Intro -->"
        print "                        <p class=\"text-base md:text-lg text-blue-50 font-medium mb-6 leading-relaxed\">"
        print "                            We reviewed your site and found the few changes that will move the needle fast."
        print "                        </p>"
        print ""
        print "                        <!-- 3 Bullets -->"
        print "                        <ul class=\"space-y-3 text-left mx-auto lg:mx-0 max-w-xl mb-6\">"
        print "                            <li class=\"flex items-start gap-3\">"
        print "                                <span class=\"flex-shrink-0 w-5 h-5 mt-0.5 rounded-full bg-white/20 flex items-center justify-center text-xs font-black\">✓</span>"
        print "                                <span class=\"text-sm md:text-base font-medium text-blue-50\">Build a mobile-first lead magnet (calls/text/bookings)</span>"
        print "                            </li>"
        print "                            <li class=\"flex items-start gap-3\">"
        print "                                <span class=\"flex-shrink-0 w-5 h-5 mt-0.5 rounded-full bg-white/20 flex items-center justify-center text-xs font-black\">✓</span>"
        print "                                <span class=\"text-sm md:text-base font-medium text-blue-50\">Fix the trust + conversion flow above the fold</span>"
        print "                            </li>"
        print "                            <li class=\"flex items-start gap-3\">"
        print "                                <span class=\"flex-shrink-0 w-5 h-5 mt-0.5 rounded-full bg-white/20 flex items-center justify-center text-xs font-black\">✓</span>"
        print "                                <span class=\"text-sm md:text-base font-medium text-blue-50\">Make it AI/GEO-ready so Google + AI can understand & recommend you</span>"
        print "                            </li>"
        print "                        </ul>"
        print ""
        print "                        <!-- How it works -->"
        print "                        <p class=\"text-sm md:text-base text-blue-100 font-bold mb-6\">"
        print "                            Short form → we build → you approve → we launch. No meetings needed."
        print "                        </p>"
        print ""
        print "                        <!-- Signature -->"
        print "                        <p class=\"text-xs md:text-sm text-blue-200 font-black mb-6\">"
        print "                            — Max &amp; Jacob (founders)"
        print "                        </p>"
        print ""
        print "                        <!-- CTA Buttons -->"
        print "                        <div class=\"flex flex-col sm:flex-row gap-4\">"
        print "                            <a href=\"#form\" class=\"inline-flex items-center justify-center px-8 py-4 bg-white text-blue-600 rounded-[1.5rem] font-black text-base md:text-lg hover:bg-blue-50 shadow-xl transition-all transform hover:scale-105\">"
        print "                                Get My Free Plan"
        print "                            </a>"
        print "                            <a href=\"#sample-homepage\" class=\"inline-flex items-center justify-center px-8 py-4 bg-white/10 text-white rounded-[1.5rem] font-black text-base md:text-lg hover:bg-white/20 border-2 border-white/30 transition-all\">"
        print "                                See Preview Example"
        print "                            </a>"
        print "                        </div>"
    }
    next
}
{print}' "$FILE" > "$FILE.tmp" && mv "$FILE.tmp" "$FILE"

echo "Section replaced successfully!"
