# Sync curated community Cursor rules & skills into this project.
# Uses shallow git clone (avoids GitHub raw rate limits).
# Re-run: powershell -ExecutionPolicy Bypass -File scripts/sync-cursor-community-assets.ps1

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$rulesDir = Join-Path $root '.cursor\rules\community'
$skillsDir = Join-Path $root '.cursor\skills'
$cacheDir = Join-Path $root '.cursor\.community-cache'

$communityRules = @(
    @{ SourceFile = 'cursor-ai-react-typescript-shadcn-ui-cursorrules-p.mdc'; Target = 'react-shadcn.mdc'; Globs = 'frontend/**/*.tsx,frontend/**/*.ts' },
    @{ SourceFile = 'typescript-nodejs-react-vite-cursorrules-prompt-fi.mdc'; Target = 'vite-react-typescript.mdc'; Globs = 'frontend/**/*.tsx,frontend/**/*.ts' },
    @{ SourceFile = 'tailwind-shadcn-ui-integration-cursorrules-prompt-.mdc'; Target = 'tailwind-shadcn.mdc'; Globs = 'frontend/**/*.tsx,frontend/**/*.css' },
    @{ SourceFile = 'react-components-creation-cursorrules-prompt-file.mdc'; Target = 'react-components.mdc'; Globs = 'frontend/**/*.tsx' },
    @{ SourceFile = 'typescript-axios-cursorrules-prompt-file.mdc'; Target = 'typescript-axios.mdc'; Globs = 'frontend/**/*.ts,frontend/**/*.tsx' },
    @{ SourceFile = 'vitest-unit-testing-cursorrules-prompt-file.mdc'; Target = 'vitest-testing.mdc'; Globs = 'frontend/**/*.test.ts,frontend/**/*.test.tsx,frontend/**/*.spec.ts,frontend/**/*.spec.tsx' },
    @{ SourceFile = 'python-fastapi-best-practices-cursorrules-prompt-f.mdc'; Target = 'fastapi-backend.mdc'; Globs = 'backend/**/*.py' },
    @{ SourceFile = 'fastapi-production-architecture-cursorrules-prompt-file.mdc'; Target = 'fastapi-architecture.mdc'; Globs = 'backend/**/*.py' },
    @{ SourceFile = 'javascript-typescript-code-quality-cursorrules-pro.mdc'; Target = 'typescript-quality.mdc'; Globs = 'frontend/**/*.ts,frontend/**/*.tsx' },
    @{ SourceFile = 'security-devsecops-ssdls-appsec.mdc'; Target = 'security-devsecops.mdc'; Globs = '**/*.ts,**/*.tsx,**/*.py' }
)

$communitySkills = @(
    @{ Repo = 'awesome-cursor-skills'; Path = 'resources/reviewing-code'; Name = 'reviewing-code' },
    @{ Repo = 'awesome-cursor-skills'; Path = 'resources/auditing-security'; Name = 'auditing-security' },
    @{ Repo = 'awesome-cursor-skills'; Path = 'resources/auditing-performance'; Name = 'auditing-performance' },
    @{ Repo = 'awesome-cursor-skills'; Path = 'resources/systematic-debugging'; Name = 'systematic-debugging' },
    @{ Repo = 'awesome-cursor-skills'; Path = 'resources/writing-tests'; Name = 'writing-tests' },
    @{ Repo = 'awesome-cursor-skills'; Path = 'resources/auto-type-checking'; Name = 'auto-type-checking' },
    @{ Repo = 'awesome-cursor-skills'; Path = 'resources/accessibility-auditing'; Name = 'accessibility-auditing' },
    @{ Repo = 'awesome-cursor-skills'; Path = 'resources/visual-qa-testing'; Name = 'visual-qa-testing' },
    @{ Repo = 'awesome-cursor-skills'; Path = 'resources/suggesting-cursor-rules'; Name = 'suggesting-cursor-rules' },
    @{ Repo = 'awesome-cursor-skills'; Path = 'resources/parallel-code-review'; Name = 'parallel-code-review' },
    @{ Repo = 'awesome-cursor-skills'; Path = 'resources/grinding-until-pass'; Name = 'grinding-until-pass' },
    @{ Repo = 'agent-skills'; Path = 'skills/react-best-practices'; Name = 'react-best-practices' }
)

$repos = @{
    'awesome-cursorrules' = 'https://github.com/PatrickJS/awesome-cursorrules.git'
    'awesome-cursor-skills' = 'https://github.com/spencerpauly/awesome-cursor-skills.git'
    'agent-skills' = 'https://github.com/vercel-labs/agent-skills.git'
}

function Ensure-Repo {
    param([string]$Name, [string]$Url)
    $path = Join-Path $cacheDir $Name
    if (-not (Test-Path $path)) {
        Write-Host "  cloning $Name..."
        git clone --depth 1 $Url $path | Out-Null
        return $path
    }
    Write-Host "  updating $Name..."
    git -C $path pull --ff-only | Out-Null
    return $path
}

function Set-CommunityRuleFrontmatter {
    param([string]$FilePath, [string]$Globs)
    $content = Get-Content -Path $FilePath -Raw -Encoding UTF8
    $description = 'Community rule (PatrickJS/awesome-cursorrules) - scoped, not always-on'

    if ($content -match '(?s)^---\s*\r?\n.*?\r?\n---') {
        $body = $content.Substring($Matches[0].Length)
    } else {
        $body = $content
    }

    $newFrontmatter = @"
---
description: $description
globs: $Globs
alwaysApply: false
source: community
---
"@
    [System.IO.File]::WriteAllText($FilePath, $newFrontmatter + "`n" + $body.TrimStart(), [System.Text.UTF8Encoding]::new($false))
}

function Copy-Directory {
    param([string]$Source, [string]$Destination)
    if (Test-Path $Destination) { Remove-Item -Recurse -Force $Destination }
    Copy-Item -Path $Source -Destination $Destination -Recurse -Force
}

Write-Host 'Preparing community cache...'
New-Item -ItemType Directory -Force -Path $cacheDir | Out-Null
$rulesRepo = Ensure-Repo -Name 'awesome-cursorrules' -Url $repos['awesome-cursorrules']
$skillsRepo = Ensure-Repo -Name 'awesome-cursor-skills' -Url $repos['awesome-cursor-skills']
$agentSkillsRepo = Ensure-Repo -Name 'agent-skills' -Url $repos['agent-skills']

Write-Host 'Syncing community rules...'
New-Item -ItemType Directory -Force -Path $rulesDir | Out-Null
foreach ($rule in $communityRules) {
    $sourcePath = Join-Path $rulesRepo ('rules\' + $rule.SourceFile)
    $targetPath = Join-Path $rulesDir $rule.Target
    if (-not (Test-Path $sourcePath)) {
        throw "Missing rule source: $($rule.SourceFile)"
    }
    Copy-Item -Path $sourcePath -Destination $targetPath -Force
    Set-CommunityRuleFrontmatter -FilePath $targetPath -Globs $rule.Globs
    Write-Host "  rule: $($rule.Target)"
}

Write-Host 'Syncing community skills...'
foreach ($skill in $communitySkills) {
    $repoRoot = if ($skill.Repo -eq 'agent-skills') { $agentSkillsRepo } else { $skillsRepo }
    $sourcePath = Join-Path $repoRoot $skill.Path
    $dest = Join-Path $skillsDir $skill.Name
    if (-not (Test-Path $sourcePath)) {
        throw "Missing skill source: $($skill.Path)"
    }
    Copy-Directory -Source $sourcePath -Destination $dest
    Write-Host "  skill: $($skill.Name)"
}

Write-Host 'Done. See .cursor/COMMUNITY-MANIFEST.md'
