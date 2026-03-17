$ErrorActionPreference = 'Stop'
$win1252 = [System.Text.Encoding]::GetEncoding(1252)

function Get-Mojibake([int]$codepoint) {
    $emoji = [char]::ConvertFromUtf32($codepoint)
    $utf8bytes = [System.Text.Encoding]::UTF8.GetBytes($emoji)
    return $win1252.GetString($utf8bytes)
}

function Get-MojibakeVS([int]$cp1, [int]$cp2) {
    # For emoji + variation selector (e.g. U+FE0F)
    $e1 = [char]::ConvertFromUtf32($cp1)
    $e2 = [char]::ConvertFromUtf32($cp2)
    $utf8bytes = [System.Text.Encoding]::UTF8.GetBytes($e1 + $e2)
    return $win1252.GetString($utf8bytes)
}

function Do-Replace($content, $old, $new) {
    if ($content.Contains($old)) {
        $count = ([regex]::Matches($content, [regex]::Escape($old))).Count
        $content = $content.Replace($old, $new)
        Write-Output "  Replaced '$old' -> '$new' ($count occurrences)"
    }
    return $content
}

$base = "c:\Users\ACER\Desktop\centralized-file-system\views"

# ===== USERDASHBOARD.EJS =====
Write-Output "`n=== userdashboard.ejs ==="
$fp = "$base\userdashboard.ejs"
$bytes = [System.IO.File]::ReadAllBytes($fp)
$c = [System.Text.Encoding]::UTF8.GetString($bytes)

# Search button emoji
$m = Get-Mojibake 0x1F50D
$c = Do-Replace $c ">$m</button>" '><i class="ri-search-line"></i></button>'

# AI sorting emojis 
$robot = Get-Mojibake 0x1F916
$c = Do-Replace $c "<span class=""ai-icon"">$robot</span>" '<span class="ai-icon"><i class="ri-robot-line"></i></span>'

# Manual sort tool emoji
$tool = Get-Mojibake 0x1F527
$c = Do-Replace $c "<span class=""ai-icon"">$tool</span>" '<span class="ai-icon"><i class="ri-tools-line"></i></span>'

# Folder emoji in drop zone
$folder = Get-Mojibake 0x1F4C2
$c = Do-Replace $c "$($folder) Drag" '<i class="ri-folder-open-line section-icon"></i>Drag'

# Auto-detect option
$c = Do-Replace $c "$($robot) Auto-detect" 'Auto-detect'

# File type select options
$doc = Get-Mojibake 0x1F4C4
$frame = Get-MojibakeVS 0x1F5BC 0xFE0F
$chart = Get-Mojibake 0x1F4CA
$c = Do-Replace $c "$doc Document" 'Document'
$c = Do-Replace $c "$($frame) Image" 'Image'
$c = Do-Replace $c "$chart Report" 'Report'

# Upload button (⬆️)
$upArrow = Get-MojibakeVS 0x2B06 0xFE0F
$c = Do-Replace $c "$upArrow Upload" '<i class="ri-upload-2-line"></i> Upload'

# File tabs
$folderOpen = Get-Mojibake 0x1F4C1
# Note: file tabs use different emoji representations
$handshake = Get-MojibakeVS 0x1F91D 0xFE0F  
$handshake2 = Get-Mojibake 0x1F91D
$trashVS = Get-MojibakeVS 0x1F5D1 0xFE0F
$trash = Get-Mojibake 0x1F5D1
$c = Do-Replace $c "$folderOpen My Files" '<i class="ri-folder-line"></i> My Files'
# Try both with and without variation selector
$c = Do-Replace $c "$($handshake) Shared with Me" '<i class="ri-share-line"></i> Shared with Me'
$c = Do-Replace $c "$($handshake2) Shared with Me" '<i class="ri-share-line"></i> Shared with Me'
$c = Do-Replace $c "$($trashVS) Recycle Bin" '<i class="ri-delete-bin-line"></i> Recycle Bin'
$c = Do-Replace $c "$($trash) Recycle Bin" '<i class="ri-delete-bin-line"></i> Recycle Bin'

# Search buttons
$searchMoji2 = Get-Mojibake 0x1F50E
$searchMoji = Get-Mojibake 0x1F50D
$c = Do-Replace $c "$($searchMoji) Search" '<i class="ri-search-line"></i> Search'
$c = Do-Replace $c "$($searchMoji2) Search" '<i class="ri-search-line"></i> Search'

# Bulk toolbar emojis
$downArrow = Get-MojibakeVS 0x2B07 0xFE0F
$downArrow2 = Get-Mojibake 0x2B07
$c = Do-Replace $c "$($downArrow) Download ZIP" '<i class="ri-download-line"></i> Download ZIP'
$c = Do-Replace $c "$($downArrow2) Download ZIP" '<i class="ri-download-line"></i> Download ZIP'
$c = Do-Replace $c "$($trashVS) Delete Selected" '<i class="ri-delete-bin-line"></i> Delete Selected'
$c = Do-Replace $c "$($trash) Delete Selected" '<i class="ri-delete-bin-line"></i> Delete Selected'

# Clear selection (✖)
$xmark = [char]0x2716
$c = Do-Replace $c "$($xmark) Clear" '<i class="ri-close-line"></i> Clear'

# Preview buttons
$eye = Get-MojibakeVS 0x1F441 0xFE0F
$eye2 = Get-Mojibake 0x1F441
$c = Do-Replace $c ">$($eye) View<" '><i class="ri-eye-line"></i> View<'
$c = Do-Replace $c ">$($eye2) View<" '><i class="ri-eye-line"></i> View<'
$c = Do-Replace $c "$($downArrow) Download<" '<i class="ri-download-line"></i> Download<'
$c = Do-Replace $c "$($downArrow2) Download<" '<i class="ri-download-line"></i> Download<'

# Tags section emoji
$label = Get-MojibakeVS 0x1F3F7 0xFE0F
$label2 = Get-Mojibake 0x1F3F7
$c = Do-Replace $c "$($label) Tags" '<i class="ri-price-tag-3-line"></i> Tags'
$c = Do-Replace $c "$($label2) Tags" '<i class="ri-price-tag-3-line"></i> Tags'

# Share section emojis
$link = Get-Mojibake 0x1F517
$c = Do-Replace $c "$($link) Share<" '<i class="ri-share-line"></i> Share<'

$clip = Get-Mojibake 0x1F4CE
$c = Do-Replace $c "$($clip) Create Share Link" '<i class="ri-link"></i> Create Share Link'
$searchEmoji3 = Get-Mojibake 0x1F50E
$c = Do-Replace $c "$($searchEmoji3) Create Share Link" '<i class="ri-link"></i> Create Share Link'

# Version history emoji
$clipboard = Get-Mojibake 0x1F4CB
$c = Do-Replace $c "$($clipboard) Version History" '<i class="ri-history-line"></i> Version History'

# Shared badge
$c = Do-Replace $c "$($link)</span>" '<i class="ri-links-line"></i></span>'

# Delete button text in JS
$c = Do-Replace $c "$($trashVS) Delete'" '<i class="ri-delete-bin-line"></i> Delete'''
$c = Do-Replace $c "$($trash) Delete'" '<i class="ri-delete-bin-line"></i> Delete'''

# File card document icon (in inline <span>)
$c = Do-Replace $c "<span style=""font-size:2rem;"">$doc</span>" '<i class="ri-file-text-line file-icon-lg"></i>'

# Empty state text
$c = Do-Replace $c "Drag & drop files above or click Upload to get started" 'Drag and drop files above or click Upload to get started'

# Timer badge emoji (⏱️)
$timer = Get-MojibakeVS 0x23F1 0xFE0F
$timer2 = Get-Mojibake 0x23F1
$c = Do-Replace $c "$($timer) Session timeout" '<i class="ri-timer-line"></i> Session timeout'
$c = Do-Replace $c "$($timer2) Session timeout" '<i class="ri-timer-line"></i> Session timeout'

# In JS detect results
$c = Do-Replace $c "const icon = d.category === 'image' ? '$($frame)'" "const icon = d.category === 'image' ? '<i class=""ri-image-line""></i>'"
$c = Do-Replace $c ": d.category === 'report' ? '$chart' : '$doc'" ": d.category === 'report' ? '<i class=""ri-bar-chart-box-line""></i>' : '<i class=""ri-file-text-line""></i>'"

# In JS displayFileNames
$c = Do-Replace $c "div.textContent = ``$doc " "div.innerHTML = '<i class=""ri-file-text-line""></i> '"

# Write back
[System.IO.File]::WriteAllBytes($fp, [System.Text.Encoding]::UTF8.GetBytes($c))
Write-Output "=== userdashboard.ejs DONE ==="

# ===== ADMINDASHBOARD.EJS =====
Write-Output "`n=== admindashboard.ejs ==="
$fp = "$base\admindashboard.ejs"
$bytes = [System.IO.File]::ReadAllBytes($fp)
$c = [System.Text.Encoding]::UTF8.GetString($bytes)

# Stat icons
$c = $c.Replace('style="font-size:1.6rem;color:#D4AF37;margin-bottom:0.5rem;display:block;"', 'class="stat-icon"')

# Session timeout badge
$c = Do-Replace $c "$($timer) Session timeout" '<i class="ri-timer-line"></i> Session timeout'
$c = Do-Replace $c "$($timer2) Session timeout" '<i class="ri-timer-line"></i> Session timeout'

# Section headings
$c = Do-Replace $c ">$($folderOpen) All Uploaded Files<" '><i class="ri-folder-3-line section-icon"></i> All Uploaded Files<'
$users = Get-Mojibake 0x1F465
$c = Do-Replace $c ">$($users) Manage Users<" '><i class="ri-group-line section-icon"></i> Manage Users<'
$scroll = Get-Mojibake 0x1F4DC
$c = Do-Replace $c ">$($scroll) Audit Logs<" '><i class="ri-file-list-3-line section-icon"></i> Audit Logs<'
$chartUp = Get-Mojibake 0x1F4C8
$c = Do-Replace $c ">$($chartUp) System Reports<" '><i class="ri-line-chart-line section-icon"></i> System Reports<'

# Filter options emojis
$bookRed = Get-Mojibake 0x1F4D5
$bookBlue = Get-Mojibake 0x1F4D8
$bookGreen = Get-Mojibake 0x1F4D7
$c = Do-Replace $c "$bookRed PDF" 'PDF'
$c = Do-Replace $c "$bookBlue DOCX" 'DOCX'
$c = Do-Replace $c "$bookGreen Excel" 'Excel'
$c = Do-Replace $c "$($frame) Images" 'Images'

# File search input emoji
$c = Do-Replace $c "placeholder=""$($searchMoji) Search files...""" 'placeholder="Search files..."'
$c = Do-Replace $c "placeholder=""$($searchMoji2) Search files...""" 'placeholder="Search files..."'

# Filter button emoji
$c = Do-Replace $c ">$($searchMoji2) Filter<" '><i class="ri-filter-line"></i> Filter<'
$c = Do-Replace $c ">$($searchMoji) Filter<" '><i class="ri-filter-line"></i> Filter<'

# Action buttons in HTML template
$c = Do-Replace $c ">$($eye) View<" '><i class="ri-eye-line"></i> View<'
$c = Do-Replace $c ">$($eye2) View<" '><i class="ri-eye-line"></i> View<'
$downVS = Get-MojibakeVS 0x2B07 0xFE0F
$c = Do-Replace $c "$($downVS) Download<" '<i class="ri-download-line"></i> Download<'
$c = Do-Replace $c "$($downArrow2) Download<" '<i class="ri-download-line"></i> Download<'
$c = Do-Replace $c "$($trashVS) Delete<" '<i class="ri-delete-bin-line"></i> Delete<'
$c = Do-Replace $c "$($trash) Delete<" '<i class="ri-delete-bin-line"></i> Delete<'

# User management table emojis
$noEntry = Get-Mojibake 0x26D4
$c = Do-Replace $c "$($noEntry) Deactivate<" '<i class="ri-forbid-line"></i> Deactivate<'
$refresh = Get-Mojibake 0x1F504
$c = Do-Replace $c "$($refresh) Update Role<" '<i class="ri-refresh-line"></i> Update Role<'

# Report button
$reportDoc = Get-Mojibake 0x1F4D1
$c = Do-Replace $c ">$($reportDoc) Generate Report<" '><i class="ri-file-chart-line"></i> Generate Report<'

# No reports yet text
$c = $c.Replace('<p style="color: #999; margin-top: 1rem;">No reports generated yet.</p>', '<p class="text-muted-sm" style="margin-top: 1rem;">No reports generated yet.</p>')

# Audit placeholder emoji
$c = Do-Replace $c "$($trashVS) File Deleted" '<i class="ri-delete-bin-line"></i> File Deleted'
$c = Do-Replace $c "$($trash) File Deleted" '<i class="ri-delete-bin-line"></i> File Deleted'

# User status check
$check = [char]0x2705
$c = Do-Replace $c "$($check) Active" '<i class="ri-checkbox-circle-line" style="color:#22c55e"></i> Active'

# Profile modal ARIA
$c = $c.Replace('<div id="adminProfileModal" class="profile-modal"', '<div id="adminProfileModal" class="profile-modal" role="dialog" aria-modal="true" aria-label="Admin Profile"')

[System.IO.File]::WriteAllBytes($fp, [System.Text.Encoding]::UTF8.GetBytes($c))
Write-Output "=== admindashboard.ejs DONE ==="

# ===== SUPERADMINDASHBOARD.EJS =====
Write-Output "`n=== superadmindashboard.ejs ==="
$fp = "$base\superadmindashboard.ejs"
$bytes = [System.IO.File]::ReadAllBytes($fp)
$c = [System.Text.Encoding]::UTF8.GetString($bytes)

# Stat icons
$c = $c.Replace('style="font-size:1.6rem;color:#D4AF37;margin-bottom:0.5rem;display:block;"', 'class="stat-icon"')

# Session timeout badge
$c = Do-Replace $c "$($timer) Session timeout" '<i class="ri-timer-line"></i> Session timeout'
$c = Do-Replace $c "$($timer2) Session timeout" '<i class="ri-timer-line"></i> Session timeout'

# Crown emoji in welcome
$crown = Get-Mojibake 0x1F451
$c = Do-Replace $c " $crown</h1>" ' <i class="ri-vip-crown-line" style="color:#D4AF37"></i></h1>'

# Section headings
$gear = Get-MojibakeVS 0x2699 0xFE0F
$gear2 = Get-Mojibake 0x2699
$c = Do-Replace $c ">$($gear) System Settings<" '><i class="ri-settings-3-line section-icon"></i> System Settings<'
$c = Do-Replace $c ">$($gear2) System Settings<" '><i class="ri-settings-3-line section-icon"></i> System Settings<'

$building = Get-Mojibake 0x1F3E2
$c = Do-Replace $c ">$($building) Branch Admin Assignments<" '><i class="ri-building-line section-icon"></i> Branch Admin Assignments<'

$c = Do-Replace $c ">$($users) Manage Admin Accounts<" '><i class="ri-group-line section-icon"></i> Manage Admin Accounts<'

$person = Get-Mojibake 0x1F9D1
$c = Do-Replace $c ">$($person) Manage User Accounts<" '><i class="ri-user-line section-icon"></i> Manage User Accounts<'

$folderOpen2 = Get-Mojibake 0x1F4C2
$c = Do-Replace $c ">$($folderOpen2) Global File Oversight<" '><i class="ri-folder-3-line section-icon"></i> Global File Oversight<'
$c = Do-Replace $c ">$($folderOpen) Global File Oversight<" '><i class="ri-folder-3-line section-icon"></i> Global File Oversight<'

$c = Do-Replace $c ">$($scroll) Audit Logs<" '><i class="ri-file-list-3-line section-icon"></i> Audit Logs<'

# Settings form emojis
$megaphone = Get-Mojibake 0x1F4E2
$c = Do-Replace $c "$($megaphone) Enable Notifications" '<i class="ri-notification-3-line"></i> Enable Notifications'

$c = Do-Replace $c "$($robot) Enable AI File Sorting" '<i class="ri-robot-line"></i> Enable AI File Sorting'

$floppy = Get-Mojibake 0x1F4BE
$c = Do-Replace $c "$($floppy) Save Settings" '<i class="ri-save-line"></i> Save Settings'

# Table action buttons
$key = Get-Mojibake 0x1F511
$c = Do-Replace $c "$($key) Reset Password" '<i class="ri-key-line"></i> Reset Password'
$c = Do-Replace $c "$($noEntry) Deactivate<" '<i class="ri-forbid-line"></i> Deactivate<'
$c = Do-Replace $c "$($trashVS) Delete Account<" '<i class="ri-delete-bin-line"></i> Delete Account<'
$c = Do-Replace $c "$($trash) Delete Account<" '<i class="ri-delete-bin-line"></i> Delete Account<'
$c = Do-Replace $c "$($trashVS) Delete<" '<i class="ri-delete-bin-line"></i> Delete<'
$c = Do-Replace $c "$($trash) Delete<" '<i class="ri-delete-bin-line"></i> Delete<'

# Promote/Demote buttons
$c = Do-Replace $c "$($refresh) Promote<" '<i class="ri-arrow-up-circle-line"></i> Promote<'
$c = Do-Replace $c "$($refresh) Demote to User<" '<i class="ri-arrow-down-circle-line"></i> Demote to User<'
$c = Do-Replace $c "$($refresh) Promote to Admin<" '<i class="ri-arrow-up-circle-line"></i> Promote to Admin<'

# Global file buttons
$c = Do-Replace $c ">$($eye) View<" '><i class="ri-eye-line"></i> View<'
$c = Do-Replace $c ">$($eye2) View<" '><i class="ri-eye-line"></i> View<'
$c = Do-Replace $c "$($downVS) Download<" '<i class="ri-download-line"></i> Download<'
$c = Do-Replace $c "$($downArrow2) Download<" '<i class="ri-download-line"></i> Download<'

# Status labels 
$c = Do-Replace $c "$($check) Active" '<i class="ri-checkbox-circle-line" style="color:#22c55e"></i> Active'

# Audit list placeholder emojis
$c = Do-Replace $c "$($trashVS) Admin01" '<i class="ri-delete-bin-line"></i> Admin01'
$c = Do-Replace $c "$($trash) Admin01" '<i class="ri-delete-bin-line"></i> Admin01'
$c = Do-Replace $c "$($robot) SuperAdmin" '<i class="ri-robot-line"></i> SuperAdmin'

# Profile modal ARIA
$c = $c.Replace('<div id="superProfileModal" class="profile-modal"', '<div id="superProfileModal" class="profile-modal" role="dialog" aria-modal="true" aria-label="Super Admin Profile"')

# Crown in JS
$c = Do-Replace $c "Welcome, `${superDisplayName} $crown" 'Welcome, ${superDisplayName} <i class="ri-vip-crown-line" style="color:#D4AF37"></i>'

[System.IO.File]::WriteAllBytes($fp, [System.Text.Encoding]::UTF8.GetBytes($c))
Write-Output "=== superadmindashboard.ejs DONE ==="

# ===== LANDING.EJS =====
Write-Output "`n=== landing.ejs ==="
$fp = "$base\landing.ejs"
$bytes = [System.IO.File]::ReadAllBytes($fp)
$c = [System.Text.Encoding]::UTF8.GetString($bytes)

$c = Do-Replace $c ">$doc<" '><i class="ri-file-text-line"></i><'
$c = Do-Replace $c ">$chart<" '><i class="ri-bar-chart-box-line"></i><'
$frameOnly = Get-MojibakeVS 0x1F5BC 0xFE0F
$c = Do-Replace $c ">$frameOnly<" '><i class="ri-image-line"></i><'

[System.IO.File]::WriteAllBytes($fp, [System.Text.Encoding]::UTF8.GetBytes($c))
Write-Output "=== landing.ejs DONE ==="

Write-Output "`nAll emoji replacements complete."
