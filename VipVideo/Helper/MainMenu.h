//
//  MainMenu.h
//  VipVideo
//
//  Created by LiHongli on 2017/10/20.
//  Copyright © 2017年 SV. All rights reserved.
//

#import <Cocoa/Cocoa.h>

@interface MainMenu : NSMenu
@property (strong, nonatomic) IBOutlet NSMenuItem* quitItem;
@property (strong, nonatomic) IBOutlet NSMenuItem* creatNewItem;
@property (strong, nonatomic) IBOutlet NSMenuItem* showItem;

+ (void)configuMainMenu:(NSMenu *)menu;

@end
