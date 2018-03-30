//
//  HLVipWindowController.m
//  VipVideo
//
//  Created by LHL on 2017/10/23.
//  Copyright © 2017年 SV. All rights reserved.
//

#import "HLVipWindowController.h"
#import "HLVipViewController.h"
@interface HLVipWindowController ()<NSWindowDelegate>

@end

@implementation HLVipWindowController

- (void)windowDidLoad {
    [super windowDidLoad];
    self.window.delegate = self;
    
    //让显示的位置居于屏幕的中心
    [[self window] center];
}

- (void)setVideoUrl:(NSString *)videoUrl{
    _videoUrl = videoUrl;
    if ([self.contentViewController isKindOfClass:[HLVipViewController class]]) {
        HLVipViewController *vipVC = (id)self.contentViewController;
        [vipVC setVideoUrl:videoUrl];
    }
}

- (void)windowWillClose:(NSNotification *)notification {
    // whichever operations are needed when the
    
    [self setVideoUrl:nil];
    
    [[[NSApplication sharedApplication].windows firstObject] makeKeyAndOrderFront:nil];
}

- (void)windowWillExitFullScreen:(NSNotification *)notification {
    
}

- (void)windowWillEnterFullScreen:(NSNotification *)notification {
    
}

//- (BOOL)windowShouldClose:(NSWindow *)sender{
//    [self.window orderOut:nil];
//    return NO;
//}



@end
